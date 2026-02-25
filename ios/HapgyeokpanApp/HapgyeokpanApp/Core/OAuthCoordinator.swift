import AuthenticationServices
import UIKit

final class OAuthCoordinator: NSObject {
    private var session: ASWebAuthenticationSession?

    func start(provider: String, baseURL: URL) async throws -> OAuthExchangeResponse {
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

        let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
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

            authSession.prefersEphemeralWebBrowserSession = true
            authSession.presentationContextProvider = self
            self.session = authSession
            authSession.start()
        }

        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidResponse
        }

        if let errorMessage = components.queryItems?.first(where: { $0.name == "error" })?.value {
            throw APIClientError.server(message: errorMessage)
        }

        guard let payloadValue = components.queryItems?.first(where: { $0.name == "payload" })?.value,
              let payloadData = Data(base64Encoded: payloadValue),
              let result = try? JSONDecoder().decode(OAuthExchangeResponse.self, from: payloadData) else {
            throw APIClientError.invalidResponse
        }

        return result
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
