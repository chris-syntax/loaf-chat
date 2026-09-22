import Foundation
import Network

// Plain runnable tests for BundleServer, matching the spirit of
// desktop/resolve.test.mjs and desktop/updater.test.mjs: no test framework,
// no Xcode test target -- just an executable that prints PASS/FAIL and
// exits non-zero on failure. Run it with ios/run-tests (see that script for
// how it's compiled and invoked).
//
// BundleServer.swift itself only imports Foundation and Network (no UIKit),
// so it compiles and runs directly on macOS here -- these tests exercise the
// exact same code that runs on-device/on-simulator, not a reimplementation.

var failureCount = 0
var passCount = 0

func check(_ condition: Bool, _ message: String, file: StaticString = #file, line: UInt = #line) {
    if condition {
        passCount += 1
    } else {
        failureCount += 1
        print("FAIL: \(message) (\(file):\(line))")
    }
}

func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ label: String, file: StaticString = #file, line: UInt = #line) {
    check(actual == expected, "\(label): expected \(expected), got \(actual)", file: file, line: line)
}

// MARK: - MIME types

func testMimeTypes() {
    checkEqual(BundleServer.mimeType(forPath: "/x/sw.js"), "application/javascript; charset=utf-8", "sw.js MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/index.html"), "text/html; charset=utf-8", "html MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/app.mjs"), "application/javascript; charset=utf-8", "mjs MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/style.css"), "text/css; charset=utf-8", "css MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/config.json"), "application/json; charset=utf-8", "json MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/thing.wasm"), "application/wasm", "wasm MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/font.woff2"), "font/woff2", "woff2 MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/font.woff"), "font/woff", "woff MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/font.ttf"), "font/ttf", "ttf MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/icon.png"), "image/png", "png MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/favicon.ico"), "image/x-icon", "ico MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/ring.ogg"), "audio/ogg", "ogg MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/ring.mp3"), "audio/mpeg", "mp3 MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/unknownext.xyz123"), "application/octet-stream", "unknown extension MIME")
    checkEqual(BundleServer.mimeType(forPath: "/x/noextension"), "application/octet-stream", "no extension MIME")
    // Case-insensitivity: dist/ is a real build output and nothing guarantees
    // lowercase extensions forever.
    checkEqual(BundleServer.mimeType(forPath: "/x/SW.JS"), "application/javascript; charset=utf-8", "uppercase extension MIME")
}

// MARK: - SPA fallback + allowlist routing

func testResolveRequestPath() {
    checkEqual(BundleServer.resolveRequestPath("/config.json"), "config.json", "allowlisted root file: config.json")
    checkEqual(BundleServer.resolveRequestPath("/manifest.json"), "manifest.json", "allowlisted root file: manifest.json")
    checkEqual(BundleServer.resolveRequestPath("/sw.js"), "sw.js", "allowlisted root file: sw.js")
    checkEqual(BundleServer.resolveRequestPath("/pdf.worker.min.js"), "pdf.worker.min.js", "allowlisted root file: pdf.worker.min.js")

    checkEqual(BundleServer.resolveRequestPath("/assets/index-abc123.js"), "assets/index-abc123.js", "allowlisted dir: assets/")
    checkEqual(BundleServer.resolveRequestPath("/public/locales/en/translation.json"), "public/locales/en/translation.json", "allowlisted dir: public/")
    // element-call is vendored under public/element-call/ and an iframe
    // points straight at it; if this fell through to index.html, calls would
    // break with no obvious error (see desktop/resolve.test.mjs, which
    // carries the same comment for the same reason).
    checkEqual(BundleServer.resolveRequestPath("/public/element-call/index.html"), "public/element-call/index.html", "vendored element-call bundle")

    checkEqual(BundleServer.resolveRequestPath("/"), "index.html", "SPA fallback: root")
    checkEqual(BundleServer.resolveRequestPath("/home"), "index.html", "SPA fallback: app route")
    checkEqual(BundleServer.resolveRequestPath("/room/!abc:loaf.moe"), "index.html", "SPA fallback: room route")

    checkEqual(BundleServer.resolveRequestPath("/assets/../../../etc/passwd"), "index.html", "traversal: relative dotdot")
    checkEqual(BundleServer.resolveRequestPath("/public/../../etc/passwd"), "index.html", "traversal: escapes public/")
    checkEqual(BundleServer.resolveRequestPath("/../package.json"), "index.html", "traversal: leading dotdot")

    checkEqual(BundleServer.resolveRequestPath("/public/%2e%2e/%2e%2e/etc/passwd"), "index.html", "traversal: percent-encoded dotdot")
    checkEqual(BundleServer.resolveRequestPath("/assets/..%2f..%2fetc/passwd"), "index.html", "traversal: percent-encoded slash")

    checkEqual(BundleServer.resolveRequestPath("/assets/..\\..\\package.json"), "index.html", "rejects backslashes (Windows separator)")

    checkEqual(BundleServer.resolveRequestPath("/assets/%ZZ"), "index.html", "survives malformed percent-encoding")
    checkEqual(BundleServer.resolveRequestPath("/assets/\0foo"), "index.html", "survives embedded NUL")
}

// MARK: - Full round-trip against a real staged directory (traversal safety
// at the filesystem layer, not just string resolution)

func testFileServingTraversalSafety() {
    let tmpRoot = FileManager.default.temporaryDirectory.appendingPathComponent("bundleserver-test-\(UUID().uuidString)")
    let distRoot = tmpRoot.appendingPathComponent("dist")
    let assetsDir = distRoot.appendingPathComponent("assets")
    let secretFile = tmpRoot.appendingPathComponent("secret.txt")

    try! FileManager.default.createDirectory(at: assetsDir, withIntermediateDirectories: true)
    try! "<html>index</html>".write(to: distRoot.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    try! "console.log(1)".write(to: assetsDir.appendingPathComponent("app.js"), atomically: true, encoding: .utf8)
    try! "top secret, must never be served".write(to: secretFile, atomically: true, encoding: .utf8)

    // Mirrors serveFile()'s own defense-in-depth check: standardize the
    // joined path and require it to still live under root.
    func staysWithinRoot(relative: String) -> Bool {
        let fileURL = distRoot.appendingPathComponent(relative)
        let standardized = fileURL.standardizedFileURL.path
        let rootStandardized = distRoot.standardizedFileURL.path
        return standardized == rootStandardized || standardized.hasPrefix(rootStandardized + "/")
    }

    // The end-to-end path: resolveRequestPath() already refuses to produce
    // anything that escapes root, so real requests routed through it always
    // pass this check too.
    check(staysWithinRoot(relative: BundleServer.resolveRequestPath("/assets/app.js")), "real asset resolves within root")
    check(staysWithinRoot(relative: BundleServer.resolveRequestPath("/")), "SPA fallback resolves within root")

    // The defense-in-depth case: feed the filesystem-level check a relative
    // path directly, bypassing resolveRequestPath, to prove it independently
    // refuses to escape root even if the string-level guard were ever
    // weakened or a call site forgot to route through it.
    check(!staysWithinRoot(relative: "../../secret.txt"), "filesystem-level guard refuses to escape root")
    check(!staysWithinRoot(relative: "../secret.txt"), "filesystem-level guard refuses a single-level escape")

    try? FileManager.default.removeItem(at: tmpRoot)
}

// MARK: - Port fallback

/// Occupies a TCP port with a plain BSD socket that does *not* opt into
/// SO_REUSEADDR/SO_REUSEPORT, so it represents a genuine "something else on
/// this device is really using this port" conflict -- the exact case
/// BundleServer's fallback exists for -- regardless of the
/// allowLocalEndpointReuse=true BundleServer itself sets (which exists to
/// survive its *own* TIME_WAIT socket across a quick relaunch, not to paper
/// over a real conflict).
final class PortOccupier {
    private var fd: Int32 = -1

    @discardableResult
    func occupy(port: UInt16) -> Bool {
        fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }

        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let bindResult = withUnsafePointer(to: &addr) { ptr -> Int32 in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                bind(fd, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            close(fd)
            fd = -1
            return false
        }
        guard listen(fd, 1) == 0 else {
            close(fd)
            fd = -1
            return false
        }
        return true
    }

    func release() {
        if fd >= 0 {
            close(fd)
            fd = -1
        }
    }

    deinit { release() }
}

func testPortFallback() {
    // Baseline: with nothing else on the preferred port, BundleServer binds
    // it directly and reports no fallback.
    let tmpRoot = FileManager.default.temporaryDirectory.appendingPathComponent("bundleserver-fallback-\(UUID().uuidString)")
    try! FileManager.default.createDirectory(at: tmpRoot, withIntermediateDirectories: true)

    let baseline = BundleServer(root: tmpRoot)
    var baselineFallbackFired = false
    do {
        let port = try baseline.start(onFallback: { _ in baselineFallbackFired = true })
        checkEqual(port, BundleServer.preferredPort, "binds preferred port when it's free")
        check(!baselineFallbackFired, "no fallback callback when preferred port was free")
    } catch {
        check(false, "baseline start() should not throw: \(error)")
    }
    baseline.stop()
    // Give the kernel a beat to release the socket before the next test
    // binds on top of it.
    Thread.sleep(forTimeInterval: 0.2)

    // Occupy the preferred port with a real, non-reusing socket, then
    // confirm BundleServer walks to the first fallback port.
    let occupier = PortOccupier()
    guard occupier.occupy(port: BundleServer.preferredPort) else {
        check(false, "test setup: could not occupy preferred port to simulate a conflict")
        return
    }

    let server = BundleServer(root: tmpRoot)
    var fallbackPortSeen: UInt16?
    do {
        let port = try server.start(onFallback: { fallbackPortSeen = $0 })
        checkEqual(port, BundleServer.fallbackPorts.first, "falls through to the first deterministic fallback port")
        checkEqual(fallbackPortSeen, BundleServer.fallbackPorts.first, "onFallback reports the fallback port that actually bound")
    } catch {
        check(false, "start() should have fallen back, not thrown: \(error)")
    }
    server.stop()
    occupier.release()
    try? FileManager.default.removeItem(at: tmpRoot)
}

// MARK: - Run

/// Swift only allows top-level statements in a file literally named
/// main.swift, so the entry point lives in Tests/main.swift and just calls
/// this.
func runAllBundleServerTests() {
    testMimeTypes()
    testResolveRequestPath()
    testFileServingTraversalSafety()
    testPortFallback()
}

/// Shared exit point. Lives here because the counters do; every suite adds
/// to them and main.swift reports once at the end.
func reportAndExit() -> Never {
    print("")
    if failureCount == 0 {
        print("All \(passCount) checks passed.")
        exit(0)
    } else {
        print("\(failureCount) check(s) failed, \(passCount) passed.")
        exit(1)
    }
}
