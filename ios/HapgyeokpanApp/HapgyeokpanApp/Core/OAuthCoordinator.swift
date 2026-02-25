import AuthenticationServices
import UIKit

enum OAuthCoordinateResult {
    case pkcePayload(OAuthExchangeResponse)
    case implicitTokens(accessToken: String, refreshToken: String)
}

final class OAuthCoordinator: NSObject {
    private var session: ASWebAuthenticationSession?

    func start(provider: String, baseURL: URL) async throws -> OAuthCoordinateResult {
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
            throw APIClientError.server(message: errorMessage)
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
