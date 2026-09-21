import UIKit

@objc(AppDelegate)
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var server: BundleServer?

    func application(_ application: UIApplication,
                      didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        self.window = window
        window.rootViewController = boot()
        window.makeKeyAndVisible()
        return true
    }

    /// Starts BundleServer and returns the view controller to show: the
    /// WKWebView shell on success, or a native error screen on a total bind
    /// failure. Never a blank/white view either way -- see "Error handling"
    /// in docs/superpowers/specs/2026-09-20-ios-client-design.md.
    private func boot() -> UIViewController {
        // dist/ is staged into the app bundle's top level by
        // mise-tasks/ios-bundle at package time (see BundleServer's doc
        // comment on why it takes a plain root URL rather than
        // Bundle.main.path(forResource:), which only finds top-level
        // resources and cannot see into subdirectories like assets/).
        let distRoot = Bundle.main.bundleURL.appendingPathComponent("dist")
        let server = BundleServer(root: distRoot)
        self.server = server

        var usedFallbackPort = false
        do {
            let port = try server.start(onFallback: { fallbackPort in
                usedFallbackPort = true
                print("LOAF_SERVER_FALLBACK port=\(fallbackPort)")
            })
            print("LOAF_SERVER_STARTED port=\(port)")
            let url = URL(string: "http://127.0.0.1:\(port)/")!
            return WebViewController(url: url, usedFallbackPort: usedFallbackPort)
        } catch {
            print("LOAF_SERVER_START_ERROR \(error)")
            return NativeErrorViewController(
                title: "Could not start Loaf Chat",
                detail: "The local server could not bind any of its candidate ports (\(BundleServer.preferredPort), \(BundleServer.fallbackPorts.map(String.init).joined(separator: ", "))). \(error)"
            )
        }
    }
}
