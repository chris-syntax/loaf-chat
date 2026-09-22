import Foundation

/// URL plumbing for Matrix SSO login inside the iOS shell.
///
/// Why any of this is needed: the web app renders its SSO button as a plain
/// `<a href>` (src/app/pages/auth/SSOLogin.tsx), so tapping it is an ordinary
/// top-level navigation to the homeserver's `/login/sso/redirect/...`. Two
/// things go wrong with that in a WKWebView.
///
/// 1. App-bound domains block top-level navigation away from the bound set,
///    so it fails outright with WKError 13 unless every host in the SSO
///    chain is bound -- which means binding the identity provider, and there
///    is no reason the app should be able to navigate there.
/// 2. Even when it works, it is the wrong shape for iOS. Credentials get
///    typed into a page hosted inside our app, with no visible address bar
///    and no shared Safari session. The platform answer is
///    ASWebAuthenticationSession: a system browser card presented *over* the
///    app, with its own cookie jar shared with Safari.
///
/// So the shell cancels that navigation and runs it in the system sheet
/// instead. The one wrinkle is the callback: the web app asks the homeserver
/// to send the browser back to `redirectUrl`, which is an
/// `http://127.0.0.1:PORT/...` URL, and ASWebAuthenticationSession can only
/// intercept a custom scheme. So we swap `redirectUrl` for our own scheme on
/// the way out, and on the way back put the `loginToken` onto the original
/// URL and hand it to the webview, which completes login exactly as it does
/// on the web (src/app/pages/auth/login/Login.tsx reads `loginToken`).
enum SSOFlow {
    /// The scheme handed to ASWebAuthenticationSession as its callback, and
    /// registered in Info.plist under CFBundleURLTypes. Reverse-DNS on the
    /// bundle id, per the usual OAuth-on-iOS convention.
    static let callbackScheme = "moe.loaf.chat.ios"

    private static let callbackHost = "sso-callback"
    private static let redirectParam = "redirectUrl"
    private static let loginTokenParam = "loginToken"

    /// Matches the Matrix SSO redirect endpoint across spec versions, which
    /// have carried it under `/v3/`, `/r0/` and `/unstable/`. Matching on the
    /// path suffix rather than a fixed version avoids silently failing to
    /// intercept -- and failing to intercept means falling back to the
    /// in-app navigation this whole type exists to prevent.
    static func isSSORedirect(_ url: URL) -> Bool {
        url.path.contains("/login/sso/redirect")
    }

    /// The URL the homeserver has been asked to return the browser to. This
    /// is the app's own origin, and it is what we reload with the token once
    /// the system sheet is done.
    static func originalRedirectURL(from ssoURL: URL) -> URL? {
        guard
            let components = URLComponents(url: ssoURL, resolvingAgainstBaseURL: false),
            let value = components.queryItems?.first(where: { $0.name == redirectParam })?.value
        else { return nil }
        return URL(string: value)
    }

    /// The same SSO URL with `redirectUrl` pointed at our custom scheme, so
    /// ASWebAuthenticationSession can recognise the callback.
    static func rewrittenForSystemSheet(_ ssoURL: URL) -> URL? {
        guard var components = URLComponents(url: ssoURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        var items = components.queryItems ?? []
        items.removeAll { $0.name == redirectParam }
        items.append(URLQueryItem(name: redirectParam, value: "\(callbackScheme)://\(callbackHost)"))
        components.queryItems = items
        return components.url
    }

    static func loginToken(from callbackURL: URL) -> String? {
        URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == loginTokenParam })?
            .value
    }

    /// The original redirect URL carrying the token, for the webview to load.
    /// Any pre-existing `loginToken` is dropped rather than duplicated, since
    /// a URL with two of them would be read inconsistently.
    static func completionURL(redirectURL: URL, loginToken: String) -> URL? {
        guard var components = URLComponents(url: redirectURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        var items = components.queryItems ?? []
        items.removeAll { $0.name == loginTokenParam }
        items.append(URLQueryItem(name: loginTokenParam, value: loginToken))
        components.queryItems = items
        return components.url
    }
}
