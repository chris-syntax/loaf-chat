import Foundation

// Plain runnable tests for SSOFlow, sharing the check helpers and counters
// declared in BundleServerTests.swift. Run with ios/run-tests.
//
// SSOFlow imports only Foundation, so these exercise the exact source that
// ships in the app.

// A realistic SSO URL, taken verbatim from a simulator run (the homeserver
// is tuwunel; the redirect target is the app's own loopback origin).
private let realSSOURL = URL(string:
    "https://matrix.loaf.moe/_matrix/client/v3/login/sso/redirect/tuwunel"
        + "?redirectUrl=http%3A%2F%2F127.0.0.1%3A8437%2Flogin%2Floaf.moe"
        + "&action=login&org.matrix.msc3824.action=login"
)!

private func testRecognisesSSORedirects() {
    check(SSOFlow.isSSORedirect(realSSOURL), "recognises a real SSO redirect URL")

    // The endpoint has lived under several spec versions; all must match, or
    // a miss silently falls back to in-app navigation.
    for version in ["v3", "r0", "unstable"] {
        let url = URL(string: "https://matrix.loaf.moe/_matrix/client/\(version)/login/sso/redirect/tuwunel")!
        check(SSOFlow.isSSORedirect(url), "recognises SSO redirect under /\(version)/")
    }

    check(
        !SSOFlow.isSSORedirect(URL(string: "http://127.0.0.1:8437/login/loaf.moe")!),
        "does not treat the app's own login route as an SSO redirect"
    )
    check(
        !SSOFlow.isSSORedirect(URL(string: "http://127.0.0.1:8437/")!),
        "does not treat the app root as an SSO redirect"
    )
    check(
        !SSOFlow.isSSORedirect(URL(string: "https://matrix.loaf.moe/_matrix/client/v3/sync")!),
        "does not treat an ordinary client API call as an SSO redirect"
    )
}

private func testExtractsOriginalRedirect() {
    let redirect = SSOFlow.originalRedirectURL(from: realSSOURL)
    checkEqual(
        redirect?.absoluteString,
        "http://127.0.0.1:8437/login/loaf.moe",
        "extracts and percent-decodes the original redirectUrl"
    )

    let missing = URL(string: "https://matrix.loaf.moe/_matrix/client/v3/login/sso/redirect/tuwunel")!
    check(
        SSOFlow.originalRedirectURL(from: missing) == nil,
        "returns nil when there is no redirectUrl to extract"
    )
}

private func testRewritesForSystemSheet() {
    guard
        let rewritten = SSOFlow.rewrittenForSystemSheet(realSSOURL),
        let components = URLComponents(url: rewritten, resolvingAgainstBaseURL: false),
        let items = components.queryItems
    else {
        check(false, "rewrittenForSystemSheet produced a usable URL")
        return
    }

    let redirects = items.filter { $0.name == "redirectUrl" }
    checkEqual(redirects.count, 1, "exactly one redirectUrl survives the rewrite")
    checkEqual(
        redirects.first?.value,
        "\(SSOFlow.callbackScheme)://sso-callback",
        "redirectUrl points at the ASWebAuthenticationSession callback scheme"
    )

    // Everything else has to survive, or the homeserver loses the provider
    // and action it was given.
    checkEqual(components.host, "matrix.loaf.moe", "host is preserved")
    check(components.path.hasSuffix("/login/sso/redirect/tuwunel"), "path and provider id preserved")
    checkEqual(
        items.first(where: { $0.name == "action" })?.value,
        "login",
        "unrelated query parameters are preserved"
    )
    checkEqual(
        items.first(where: { $0.name == "org.matrix.msc3824.action" })?.value,
        "login",
        "dotted MSC parameters are preserved"
    )
}

private func testExtractsLoginToken() {
    let callback = URL(string: "\(SSOFlow.callbackScheme)://sso-callback?loginToken=syt_abc123")!
    checkEqual(SSOFlow.loginToken(from: callback), "syt_abc123", "extracts loginToken from the callback")

    check(
        SSOFlow.loginToken(from: URL(string: "\(SSOFlow.callbackScheme)://sso-callback")!) == nil,
        "returns nil when the callback carries no loginToken"
    )
}

private func testBuildsCompletionURL() {
    let redirect = URL(string: "http://127.0.0.1:8437/login/loaf.moe")!
    let completion = SSOFlow.completionURL(redirectURL: redirect, loginToken: "syt_abc123")

    checkEqual(
        completion?.absoluteString,
        "http://127.0.0.1:8437/login/loaf.moe?loginToken=syt_abc123",
        "appends the token to the original redirect URL"
    )

    // src/app/pages/auth/login/Login.tsx reads a single loginToken param;
    // two of them would be read inconsistently.
    let alreadyHasOne = URL(string: "http://127.0.0.1:8437/login/loaf.moe?loginToken=stale")!
    guard
        let replaced = SSOFlow.completionURL(redirectURL: alreadyHasOne, loginToken: "fresh"),
        let items = URLComponents(url: replaced, resolvingAgainstBaseURL: false)?.queryItems
    else {
        check(false, "completionURL handled a URL that already had a token")
        return
    }
    checkEqual(items.filter { $0.name == "loginToken" }.count, 1, "a stale loginToken is replaced, not duplicated")
    checkEqual(items.first(where: { $0.name == "loginToken" })?.value, "fresh", "the fresh token wins")
}

private func testRoundTrip() {
    // The whole point, end to end: real SSO URL in, app URL carrying the
    // token out, with nothing lost along the way.
    guard
        let redirect = SSOFlow.originalRedirectURL(from: realSSOURL),
        SSOFlow.rewrittenForSystemSheet(realSSOURL) != nil
    else {
        check(false, "round trip: rewrite step produced usable URLs")
        return
    }
    let callback = URL(string: "\(SSOFlow.callbackScheme)://sso-callback?loginToken=syt_round")!
    guard
        let token = SSOFlow.loginToken(from: callback),
        let completion = SSOFlow.completionURL(redirectURL: redirect, loginToken: token)
    else {
        check(false, "round trip: callback step produced a completion URL")
        return
    }
    checkEqual(
        completion.absoluteString,
        "http://127.0.0.1:8437/login/loaf.moe?loginToken=syt_round",
        "round trip lands back on the app origin with the token"
    )
}

func runAllSSOFlowTests() {
    testRecognisesSSORedirects()
    testExtractsOriginalRedirect()
    testRewritesForSystemSheet()
    testExtractsLoginToken()
    testBuildsCompletionURL()
    testRoundTrip()
}
