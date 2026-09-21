import UIKit
import WebKit

/// Hosts the bundled web app in a WKWebView, using the exact configuration
/// the spike proved works: app-bound domains limited to `127.0.0.1`, no ATS
/// exception of any kind. See "Decision: bundled origin on a fixed loopback
/// port" in docs/superpowers/specs/2026-09-20-ios-client-design.md -- this
/// class must not deviate from that configuration; it is the thing the
/// spike spent a day establishing.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let targetURL: URL
    private let usedFallbackPort: Bool
    private var webView: WKWebView!
    private var didShowFallbackNotice = false
    private var didReportError = false
    private var serviceWorkerBecameReady = false

    /// Wall-clock budget for the service worker to reach `activated` with a
    /// controller attached, counted from navigation finishing. Generous
    /// because this covers cold IndexedDB/crypto-wasm setup on first run,
    /// not just script parse time.
    private static let serviceWorkerReadyTimeout: TimeInterval = 20

    /// window.__LOAF_IOS__ = true. This is a contract the web side already
    /// depends on (src/app/utils/iosShell.ts): "before any page script
    /// runs, the WKWebView host sets window.__LOAF_IOS__ = true. ... Every
    /// other environment ... must leave the property undefined." Injected
    /// at .atDocumentStart, main-frame only, so it exists before
    /// src/index.tsx (or anything else) runs, and so an element-call iframe
    /// on a different origin never sees it (app-bound domains wouldn't let
    /// that iframe be top-level anyway, but this keeps the *signal* scoped
    /// to the frame it's meant for too).
    private static let iosShellContractScript = """
    window.__LOAF_IOS__ = true;
    """

    /// Observes -- does not perform -- service worker registration. The app
    /// itself registers /sw.js (src/index.tsx); this only watches for the
    /// result and reports it to native, per "Service-worker registration
    /// failure is asserted and surfaced" in the design doc's error-handling
    /// section.
    ///
    /// The trap this exists to avoid: `registration.active` (and
    /// `navigator.serviceWorker.ready`, which resolves on the same
    /// condition) becomes non-null as soon as the worker enters
    /// `activating`, *before* `clients.claim()` inside the activate
    /// handler's `event.waitUntil()` has resolved. Reporting "ready" at that
    /// point is a false positive: the fetch handler is installed but not
    /// yet controlling this page, so the very first authenticated-media
    /// request can still fall through uncontrolled. This cost the spike a
    /// false negative before it was diagnosed. The only correct signal is
    /// `active.state === 'activated'` **and** controller presence
    /// (`navigator.serviceWorker.controller`, confirmed via
    /// `controllerchange` if it isn't already set).
    private static let serviceWorkerReadinessScript = """
    (function() {
      function report(status, detail) {
        try {
          // window.__LOAF_IOS__ is folded into every report so native-side
          // logs double as evidence the iosShell.ts contract actually held,
          // without a separate round trip.
          window.webkit.messageHandlers.loafNative.postMessage(
            JSON.stringify(Object.assign({ status: status, iosFlag: window.__LOAF_IOS__ }, detail || {}))
          );
        } catch (e) {}
      }
      if (!('serviceWorker' in navigator)) {
        report('unsupported');
        return;
      }
      var reported = false;
      function finish(status, detail) {
        if (reported) return;
        reported = true;
        report(status, detail);
      }
      function isActivated(reg) {
        return !!(reg && reg.active && reg.active.state === 'activated');
      }
      function watch(reg) {
        function check() {
          if (isActivated(reg) && navigator.serviceWorker.controller) {
            finish('ready');
          }
        }
        check();
        if (reg.installing) reg.installing.addEventListener('statechange', check);
        if (reg.waiting) reg.waiting.addEventListener('statechange', check);
        if (reg.active) reg.active.addEventListener('statechange', check);
        navigator.serviceWorker.addEventListener('controllerchange', check);
      }
      // The app's own bootstrap (src/index.tsx) calls register(), not us --
      // we only observe. We run at document-start, before that page script,
      // so a registration may not exist yet: poll briefly for one to appear
      // instead of assuming it already does.
      var pollAttempts = 0;
      var pollTimer = setInterval(function() {
        if (reported) { clearInterval(pollTimer); return; }
        pollAttempts++;
        navigator.serviceWorker.getRegistration().then(function(reg) {
          if (reg) {
            clearInterval(pollTimer);
            watch(reg);
          } else if (pollAttempts > 150) {
            clearInterval(pollTimer);
          }
        }).catch(function() {});
      }, 200);
    })();
    """

    init(url: URL, usedFallbackPort: Bool) {
        self.targetURL = url
        self.usedFallbackPort = usedFallbackPort
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("not supported")
    }

    override func loadView() {
        let config = WKWebViewConfiguration()

        // --- Proven, spike-verified configuration. Do not deviate. ---
        config.limitsNavigationsToAppBoundDomains = true

        // Without these, remote call audio/video from element-call never
        // autoplay (see "Calls" in the design doc).
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let contentController = WKUserContentController()
        contentController.add(self, name: "loafNative")
        contentController.addUserScript(WKUserScript(
            source: Self.iosShellContractScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        contentController.addUserScript(WKUserScript(
            source: Self.serviceWorkerReadinessScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        self.webView = webView
        self.view = webView

        // Fires if the readiness script's own poll+watch loop never gets a
        // 'ready' report within budget -- covers both "registration never
        // appeared" and "activated but controller never attached".
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.serviceWorkerReadyTimeout) { [weak self] in
            self?.reportServiceWorkerTimeoutIfStillWaiting()
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        print("LOAF_LOADING url=\(targetURL.absoluteString) usedFallbackPort=\(usedFallbackPort)")
        webView.load(URLRequest(url: targetURL))
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        showFallbackNoticeIfNeeded()
    }

    // MARK: - Fallback-port notice

    /// Surfaces a fallback bind (see BundleServer) rather than letting it
    /// pass silently: a fallback port is a new origin, and a new origin is
    /// a logged-out user, per "The port must be fixed" in the design doc.
    private func showFallbackNoticeIfNeeded() {
        guard usedFallbackPort, !didShowFallbackNotice else { return }
        didShowFallbackNotice = true
        let alert = UIAlertController(
            title: "Temporary session",
            message: "Loaf Chat's usual local port was unavailable, so this launch is using a fallback. You may need to log in again, and this session won't persist to the next launch.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    // MARK: - WKUIDelegate

    /// Without this, getUserMedia is denied outright and element-call
    /// silently sees no devices (see "Calls" in the design doc).
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("LOAF_NAV_FINISHED url=\(webView.url?.absoluteString ?? "nil")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("LOAF_NAV_FAIL error=\(error)")
        reportFailure(title: "Could not load Loaf Chat", detail: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("LOAF_NAV_PROVISIONAL_FAIL error=\(error)")
        reportFailure(title: "Could not load Loaf Chat", detail: error.localizedDescription)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "loafNative" else { return }
        print("LOAF_SW_MESSAGE \(message.body)")

        guard
            let jsonString = message.body as? String,
            let jsonData = jsonString.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
            let status = payload["status"] as? String
        else {
            return
        }

        switch status {
        case "ready":
            serviceWorkerBecameReady = true
            print("LOAF_SW_READY")
        case "unsupported":
            reportFailure(
                title: "Service worker unavailable",
                detail: "navigator.serviceWorker was not present. Authenticated media (avatars, images) will not load."
            )
        case "timeout":
            reportFailure(
                title: "Service worker did not start",
                detail: "The app's service worker did not reach the activated state in time. Authenticated media (avatars, images) will not load."
            )
        default:
            break
        }
    }

    // MARK: - Failure -> native error screen

    private func reportServiceWorkerTimeoutIfStillWaiting() {
        // The JS side's own timer normally posts 'timeout' first; this is a
        // backstop for the case where the message never arrives at all
        // (e.g. the page itself never finished loading). Must not fire once
        // 'ready' has already been reported -- this fired as a false
        // positive on a healthy run before serviceWorkerBecameReady was
        // added, because reportFailure()'s didReportError latch is only set
        // on the failure path, not on success.
        guard !didReportError, !serviceWorkerBecameReady else { return }
        reportFailure(
            title: "Service worker did not start",
            detail: "No readiness signal was received in time. Authenticated media (avatars, images) will not load."
        )
    }

    private func reportFailure(title: String, detail: String) {
        guard !didReportError else { return }
        didReportError = true
        let errorVC = NativeErrorViewController(title: title, detail: detail)
        errorVC.modalPresentationStyle = .fullScreen
        present(errorVC, animated: true)
    }
}
