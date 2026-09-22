import Foundation
import Network

/// Errors surfaced by `BundleServer.start`. Every case is meant to reach a
/// **native** error screen (see "Error handling" in
/// docs/superpowers/specs/2026-09-20-ios-client-design.md) rather than being
/// swallowed into a webview that loads nothing and looks merely blank.
enum BundleServerError: Error, CustomStringConvertible {
    case invalidPort(UInt16)
    case bindFailed(UInt16, Error)
    case bindTimedOut(UInt16)
    case allPortsExhausted([UInt16])

    var description: String {
        switch self {
        case .invalidPort(let port):
            return "invalid port \(port)"
        case .bindFailed(let port, let error):
            return "failed to bind port \(port): \(error)"
        case .bindTimedOut(let port):
            return "timed out waiting to bind port \(port)"
        case .allPortsExhausted(let ports):
            return "could not bind any candidate port: \(ports)"
        }
    }
}

/// Minimal loopback HTTP/1.1 server, built on Network.framework only (no
/// SwiftPM dependencies, matching the spike). Serves the bundled `dist/` web
/// build with an SPA fallback identical in spirit to `desktop/resolve.js`
/// (which does the same job for the `app://` protocol on desktop).
///
/// The origin this server answers on is IndexedDB's partition key for the
/// web app's session storage (see "The port must be fixed" in the design
/// doc). Binding a different port than last launch is not a cosmetic
/// change -- it is a fresh origin, a fresh IndexedDB, and a logged-out user.
/// `start()` therefore always tries `Self.preferredPort` first and only
/// moves through `Self.fallbackPorts` -- a short, fixed, *deterministic*
/// sequence, never a random or OS-assigned ephemeral port -- if the
/// preferred one is genuinely unavailable.
final class BundleServer {
    /// The port the whole origin design commits to. Must match the URL
    /// WebViewController loads and the WKAppBoundDomains entry in
    /// Info.plist (which constrains the *domain*, not the port, but the two
    /// are chosen together and documented together for that reason).
    static let preferredPort: UInt16 = 8437

    /// Reached only if 8437 is already bound by something else on the
    /// device. Short and fixed on purpose: a developer staring at two
    /// consecutive runs should be able to predict which port they land on,
    /// and a long or random list would make "a fallback happened" harder to
    /// notice, not easier.
    static let fallbackPorts: [UInt16] = [8438, 8439, 8440]

    /// How long to wait for NWListener to report ready/failed before giving
    /// up on a candidate port. NWListener's failure mode (e.g. EADDRINUSE)
    /// is reported asynchronously via stateUpdateHandler, not by `start()`
    /// throwing synchronously, so callers need something to block on.
    static let bindTimeout: TimeInterval = 2.0

    private(set) var boundPort: UInt16?
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "moe.loaf.chat.bundleserver")
    private let root: URL
    private let rootStandardizedPath: String

    /// Allowlisted root-level files and directory prefixes, ported 1:1 from
    /// `desktop/resolve.js` (itself ported from `docker-nginx.conf`, the
    /// production spec both desktop and iOS defer to). Keeping this list
    /// identical means a route that works on desktop works here without
    /// re-deriving the allowlist, and a future third platform has one place
    /// to copy from.
    static let allowlistedFiles: Set<String> = [
        "/config.json", "/manifest.json", "/sw.js", "/pdf.worker.min.js",
    ]
    static let allowlistedDirectoryPrefixes = ["/public/", "/assets/"]

    /// - Parameter root: directory containing the staged web build (i.e.
    ///   the directory that itself contains `index.html`, `sw.js`,
    ///   `assets/`, `public/`, ...). For the packaged app this is
    ///   `<bundle>/dist`, staged there by `mise-tasks/ios-bundle`.
    init(root: URL) {
        self.root = root
        self.rootStandardizedPath = root.standardizedFileURL.path
    }

    /// Tries `preferredPort`, then each of `fallbackPorts` in order.
    /// - Parameter onFallback: invoked (on an arbitrary background queue)
    ///   with the port that ultimately bound, but *only* when it was not
    ///   the preferred port. A fallback port is a new origin and therefore
    ///   a fresh session (see class doc); the caller uses this callback to
    ///   surface that to the user rather than let it pass silently.
    /// - Returns: the port actually bound.
    /// - Throws: `BundleServerError.allPortsExhausted` if every candidate,
    ///   including every fallback, fails to bind.
    @discardableResult
    func start(onFallback: ((UInt16) -> Void)? = nil) throws -> UInt16 {
        let candidates = [Self.preferredPort] + Self.fallbackPorts
        var lastError: Error = BundleServerError.allPortsExhausted(candidates)
        for (index, candidate) in candidates.enumerated() {
            do {
                try bind(port: candidate)
                boundPort = candidate
                if index > 0 {
                    onFallback?(candidate)
                }
                return candidate
            } catch {
                lastError = error
                continue
            }
        }
        throw lastError
    }

    func stop() {
        listener?.cancel()
        listener = nil
        boundPort = nil
    }

    // MARK: - Binding

    private func bind(port: UInt16) throws {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            throw BundleServerError.invalidPort(port)
        }

        let params = NWParameters.tcp
        // Lets a quick relaunch rebind a port still lingering in TIME_WAIT
        // from the previous process (proven in the spike). It does not
        // paper over a genuine conflict: the kernel still enforces
        // exclusivity against a socket on the other end that did not itself
        // opt into reuse, which is exactly the shape of "something else on
        // the device is really using this port" (see BundleServerTests).
        params.allowLocalEndpointReuse = true
        // Bind the loopback *address*, not just the loopback interface.
        // requiredInterfaceType alone still listened on the wildcard address
        // (lsof showed *:8437), which put the server on the LAN of whatever
        // network the phone -- or a simulator's host Mac -- was on. It only
        // serves the public web bundle, but nothing outside this device has
        // any business reaching it.
        params.requiredInterfaceType = .loopback
        params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: nwPort)

        guard let candidateListener = try? NWListener(using: params) else {
            throw BundleServerError.bindFailed(port, BundleServerError.invalidPort(port))
        }

        let semaphore = DispatchSemaphore(value: 0)
        var bindError: Error?
        var settled = false

        candidateListener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                guard !settled else { return }
                settled = true
                semaphore.signal()
            case .failed(let error):
                guard !settled else { return }
                settled = true
                bindError = error
                semaphore.signal()
            case .cancelled:
                guard !settled else { return }
                settled = true
                bindError = bindError ?? BundleServerError.bindFailed(port, NWError.posix(.ECANCELED))
                semaphore.signal()
            default:
                break
            }
        }
        candidateListener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection: connection)
        }
        candidateListener.start(queue: queue)

        let waitResult = semaphore.wait(timeout: .now() + Self.bindTimeout)
        if waitResult == .timedOut {
            candidateListener.cancel()
            throw BundleServerError.bindTimedOut(port)
        }
        if let bindError = bindError {
            candidateListener.cancel()
            throw BundleServerError.bindFailed(port, bindError)
        }

        // Past the synchronous ready/failed race: keep the listener, and
        // swap in a plain logger for whatever it reports for the rest of
        // its life (e.g. .cancelled when we stop() it later).
        candidateListener.stateUpdateHandler = { state in
            print("BundleServer[\(port)] state: \(state)")
        }
        self.listener = candidateListener
    }

    // MARK: - Connection handling

    private func handle(connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            var newBuffer = buffer
            if let data = data, !data.isEmpty {
                newBuffer.append(data)
            }
            if let range = newBuffer.range(of: Data("\r\n\r\n".utf8)) {
                let headerData = newBuffer[..<range.lowerBound]
                let headerString = String(data: headerData, encoding: .utf8) ?? ""
                self.respond(to: headerString, on: connection)
                return
            }
            if isComplete || error != nil || newBuffer.count > 32_768 {
                connection.cancel()
                return
            }
            self.receive(on: connection, buffer: newBuffer)
        }
    }

    private func respond(to headerString: String, on connection: NWConnection) {
        let lines = headerString.split(separator: "\r\n")
        guard let requestLine = lines.first else {
            sendResponse(status: "400 Bad Request", contentType: "text/plain; charset=utf-8", body: Data(), extraHeaders: [:], on: connection)
            return
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            sendResponse(status: "400 Bad Request", contentType: "text/plain; charset=utf-8", body: Data(), extraHeaders: [:], on: connection)
            return
        }
        let method = String(parts[0])
        let rawPath = String(parts[1])
        let pathOnly = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath

        guard method == "GET" || method == "HEAD" else {
            sendResponse(status: "405 Method Not Allowed", contentType: "text/plain; charset=utf-8", body: Data("method not allowed".utf8), extraHeaders: ["Allow": "GET, HEAD"], on: connection)
            return
        }

        let relative = Self.resolveRequestPath(pathOnly)
        let isHead = method == "HEAD"
        print("LOAF_HTTP_REQUEST \(method) \(pathOnly) -> \(relative)")

        if relative == "sw.js" {
            serveFile(relativePath: relative, extraHeaders: ["Service-Worker-Allowed": "/"], on: connection, headOnly: isHead)
        } else {
            serveFile(relativePath: relative, extraHeaders: [:], on: connection, headOnly: isHead)
        }
    }

    /// Maps a request pathname onto a path relative to `root`, mirroring
    /// `desktop/resolve.js` exactly: the allowlist doubles as the traversal
    /// guard, because a normalized path that climbs out of an allowlisted
    /// prefix no longer matches it and falls through to the SPA fallback
    /// instead of ever reaching the filesystem.
    static func resolveRequestPath(_ pathname: String) -> String {
        let fallback = "index.html"

        guard let decoded = pathname.removingPercentEncoding else {
            // Malformed percent-encoding. Not worth an error page.
            return fallback
        }

        // NUL truncates paths in some C APIs, and a backslash is a
        // separator on Windows but not in our POSIX-style normalizer, so
        // neither may reach the filesystem layer.
        if decoded.contains("\0") || decoded.contains("\\") {
            return fallback
        }

        let normalized = normalizePosixPath(decoded)

        if allowlistedFiles.contains(normalized) {
            return String(normalized.dropFirst())
        }
        if allowlistedDirectoryPrefixes.contains(where: { normalized.hasPrefix($0) }) {
            return String(normalized.dropFirst())
        }
        return fallback
    }

    /// A small POSIX-style `normalize()`, equivalent to Node's
    /// `path.posix.normalize` for the inputs this server sees: collapses
    /// `.`/`..` segments, and -- the traversal-relevant behaviour -- drops a
    /// leading `..` on an absolute path rather than resolving it outside the
    /// root, exactly like `path.posix.normalize('/../x')` returning `/x`.
    static func normalizePosixPath(_ path: String) -> String {
        let isAbsolute = path.hasPrefix("/")
        let segments = path.split(separator: "/", omittingEmptySubsequences: true)
        var stack: [Substring] = []
        for segment in segments {
            if segment == "." {
                continue
            }
            if segment == ".." {
                if isAbsolute {
                    if !stack.isEmpty {
                        stack.removeLast()
                    }
                    // ".." at the root of an absolute path is a no-op.
                } else if let last = stack.last, last != ".." {
                    stack.removeLast()
                } else {
                    stack.append(segment)
                }
                continue
            }
            stack.append(segment)
        }
        let joined = stack.joined(separator: "/")
        if isAbsolute {
            return "/" + joined
        }
        return joined.isEmpty ? "." : joined
    }

    // MARK: - File serving

    private func serveFile(relativePath: String, extraHeaders: [String: String], on connection: NWConnection, headOnly: Bool) {
        let fileURL = root.appendingPathComponent(relativePath)
        let standardizedPath = fileURL.standardizedFileURL.path

        // Defense in depth: resolveRequestPath already refuses to produce a
        // path that escapes root, but this is the last point before the
        // filesystem, so check again rather than trust it (same posture as
        // desktop/main.js's `serve()`).
        guard standardizedPath == rootStandardizedPath || standardizedPath.hasPrefix(rootStandardizedPath + "/") else {
            sendResponse(status: "404 Not Found", contentType: "text/plain; charset=utf-8", body: Data("not found".utf8), extraHeaders: [:], on: connection)
            return
        }

        guard let data = FileManager.default.contents(atPath: standardizedPath) else {
            // The SPA fallback itself is missing -- that is a packaging bug,
            // not a user-facing 404. Report as a plain 404; AppDelegate/
            // WebViewController surface true failures via the service-worker
            // readiness check and navigation delegate instead.
            sendResponse(status: "404 Not Found", contentType: "text/plain; charset=utf-8", body: Data("not found".utf8), extraHeaders: [:], on: connection)
            return
        }

        let contentType = Self.mimeType(forPath: standardizedPath)
        sendResponse(status: "200 OK", contentType: contentType, body: headOnly ? Data() : data, extraHeaders: extraHeaders, contentLength: data.count, on: connection)
    }

    /// Content-Type per extension. This matters more here than it would on
    /// a normal static host: `sw.js` served with a non-JavaScript MIME type
    /// makes `navigator.serviceWorker.register()` reject outright, which
    /// breaks every image in the app while the app looks otherwise healthy.
    static func mimeType(forPath path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map", "webmanifest": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "ogg": return "audio/ogg"
        case "mp3": return "audio/mpeg"
        case "mp4": return "video/mp4"
        case "webm": return "video/webm"
        case "txt": return "text/plain; charset=utf-8"
        case "toml": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    // MARK: - Response writing

    private func sendResponse(status: String, contentType: String, body: Data, extraHeaders: [String: String], contentLength: Int? = nil, on connection: NWConnection) {
        var headerLines = [
            "HTTP/1.1 \(status)",
            "Content-Type: \(contentType)",
            "Content-Length: \(contentLength ?? body.count)",
            "Connection: close",
            // The whole point of the bundled server is to serve exactly what
            // shipped in this build; a stale cached sw.js across app updates
            // would silently keep running old worker logic.
            "Cache-Control: no-store",
        ]
        for (key, value) in extraHeaders {
            headerLines.append("\(key): \(value)")
        }
        let headerString = headerLines.joined(separator: "\r\n") + "\r\n\r\n"
        var responseData = Data(headerString.utf8)
        responseData.append(body)
        connection.send(content: responseData, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
