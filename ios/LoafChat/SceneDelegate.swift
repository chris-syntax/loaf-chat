import UIKit

/// Creates the app's window. Required from iOS 27, which terminates apps
/// still on the pre-UIScene lifecycle at launch. Declared in Info.plist under
/// UIApplicationSceneManifest; the @objc name keeps that entry free of a
/// module prefix, matching AppDelegate.
@objc(SceneDelegate)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard
            let windowScene = scene as? UIWindowScene,
            let app = UIApplication.shared.delegate as? AppDelegate
        else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = app.rootViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}
