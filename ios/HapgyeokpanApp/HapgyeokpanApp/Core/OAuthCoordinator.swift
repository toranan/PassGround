import Foundation
import AuthenticationServices
import UIKit

enum OAuthCoordinateResult {
    case pkcePayload(OAuthExchangeResponse)
    case implicitTokens(accessToken: String, refreshToken: String)
}

final class OAuthCoordinator: NSObject {
    private var session: ASWebAuthenticationSession?
    private static let callbackNotification = Notification.Name("HapgyeokpanOAuthCallback")

    func start(provider: String, baseURL: URL) async throws -> OAuthCoordinateResult {
        let authURL = try buildStartURL(provider: provider, baseURL: baseURL)

        let callbackURL: URL
        if provider == "kakao" {
            if Self.isKakaoTalkInstalled() {
                do {
                    callbackURL = try await startWithExternalBrowser(authURL)
                } catch {
                    // Fallback to web auth if app-first flow fails.
                    callbackURL = try await startWithASWebAuthenticationSession(authURL)
                }
            } else {
                callbackURL = try await startWithASWebAuthenticationSession(authURL)
            }
        } else {
            callbackURL = try await startWithASWebAuthenticationSession(authURL)
        }

        return try parseCallback(callbackURL)
    }

    static func handleIncomingURL(_ url: URL) {
        guard isOAuthCallbackURL(url) else { return }
        NotificationCenter.default.post(name: callbackNotification, object: url)
    }

    private static func isOAuthCallbackURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "hapgyeokpan" else { return false }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        return host == "oauth-callback" || path == "/oauth-callback"
    }

    private static func isKakaoTalkInstalled() -> Bool {
        guard let url = URL(string: "kakaotalk://") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    private func buildStartURL(provider: String, baseURL: URL) throws -> URL {
        let appRedirect = "hapgyeokpan://oauth-callback"
        var components = URLComponents(url: baseURL.appendingPathComponent("api/auth/oauth/start"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "next", value: "/mypage"),
            URLQueryItem(name: "mobile", value: "1"),
            URLQueryItem(name: "app_redirect", value: appRedirect)
        ]
        guard let url = components?.url else {
            throw APIClientError.invalidURL
        }
        return url
    }

    private func startWithASWebAuthenticationSession(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let authSession = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "hapgyeokpan"
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: APIClientError.emptyResponse)
                    return
                }
                continuation.resume(returning: callbackURL)
            }

            // Keep browser session cookies for social providers like Kakao.
            authSession.prefersEphemeralWebBrowserSession = false
            authSession.presentationContextProvider = self
            self.session = authSession
            authSession.start()
        }
    }

    private func startWithExternalBrowser(_ url: URL) async throws -> URL {
        let opened = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            UIApplication.shared.open(url, options: [:]) { success in
                continuation.resume(returning: success)
            }
        }
        guard opened else {
            throw APIClientError.server(message: "카카오 로그인 화면을 열지 못했어. 잠시 후 다시 시도해줘.")
        }
        return try await waitForIncomingCallback(timeoutSeconds: 180)
    }

    private func waitForIncomingCallback(timeoutSeconds: UInt64) async throws -> URL {
        try await withThrowingTaskGroup(of: URL.self) { group in
            group.addTask {
                for await message in NotificationCenter.default.notifications(named: Self.callbackNotification) {
                    if let url = message.object as? URL {
                        return url
                    }
                }
                throw APIClientError.emptyResponse
            }
            group.addTask {
                try await Task.sleep(nanoseconds: timeoutSeconds * 1_000_000_000)
                throw APIClientError.server(message: "로그인 시간이 초과됐어. 다시 시도해줘.")
            }

            guard let first = try await group.next() else {
                throw APIClientError.emptyResponse
            }
            group.cancelAll()
            return first
        }
    }

    private func parseCallback(_ callbackURL: URL) throws -> OAuthCoordinateResult {
        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
            print("OAuth Failed: invalid callbackURL structure \(callbackURL)")
            throw APIClientError.invalidResponse
        }

        print("OAuth Callback URL: \(callbackURL.absoluteString)")

        // Check for Implicit Flow URL Hash (Fragment) overrides first
        if let fragment = components.fragment {
            var dummy = URLComponents()
            dummy.query = fragment
            if let items = dummy.queryItems,
               let access = items.first(where: { $0.name == "access_token" })?.value,
               let refresh = items.first(where: { $0.name == "refresh_token" })?.value {
                return .implicitTokens(accessToken: access, refreshToken: refresh)
            }
        }

        if let errorMessage = components.queryItems?.first(where: { $0.name == "error" })?.value {
            print("OAuth Failed with error component: \(errorMessage)")
            throw APIClientError.server(message: normalizeOAuthError(errorMessage))
        }

        guard var payloadValue = components.queryItems?.first(where: { $0.name == "payload" })?.value else {
            print("OAuth Failed: no payload found in queryItems")
            throw APIClientError.invalidResponse
        }

        // Swift requires correct base64 padding
        let paddingLength = 4 - (payloadValue.count % 4)
        if paddingLength < 4 {
            payloadValue += String(repeating: "=", count: paddingLength)
        }

        guard let payloadData = Data(base64Encoded: payloadValue) else {
            print("OAuth Failed: could not decode Base64 string \(payloadValue)")
            throw APIClientError.invalidResponse
        }

        guard let result = try? JSONDecoder().decode(OAuthExchangeResponse.self, from: payloadData) else {
            let str = String(data: payloadData, encoding: .utf8) ?? ""
            print("OAuth Failed: could not decode JSON Payload \(str)")
            throw APIClientError.invalidResponse
        }

        print("OAuth Success! User: \(result.user.nickname)")
        return .pkcePayload(result)
    }

    private func normalizeOAuthError(_ value: String) -> String {
        let raw = value.removingPercentEncoding ?? value
        let message = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = message.lowercased()

        if lower == "social_disabled" {
            return "소셜 로그인이 비활성화되어 있어. 관리자에게 문의해줘."
        }
        if lower == "invalid_provider" || lower == "provider_not_enabled" {
            return "해당 로그인 방식이 아직 준비되지 않았어."
        }
        if lower == "invalid_mobile_redirect" {
            return "앱 로그인 경로 설정이 맞지 않아. 앱을 다시 실행해줘."
        }
        if lower == "server_config" || lower.contains("unsupported provider") {
            return "애플 로그인 설정이 아직 완료되지 않았어. 관리자에게 확인해줘."
        }
        if lower == "oauth_start_failed" {
            return "로그인 시작에 실패했어. 잠시 후 다시 시도해줘."
        }
        return message
    }
}

extension OAuthCoordinator: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}
