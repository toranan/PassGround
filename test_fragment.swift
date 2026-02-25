import Foundation

let url = URL(string: "hapgyeokpan://oauth-callback?next=%2Fmypage&error=oauth_failed#access_token=eyJhbG...&expires_at=1772016377&expires_in=3600&provider_token=ya29...&refresh_token=ahkuvv5xq4tp&sb=&token_type=bearer")!

var accessToken: String?
var refreshToken: String?

if let fragment = url.fragment {
    var dummyComponents = URLComponents()
    dummyComponents.query = fragment
    if let items = dummyComponents.queryItems {
        accessToken = items.first(where: { $0.name == "access_token" })?.value
        refreshToken = items.first(where: { $0.name == "refresh_token" })?.value
    }
}

print("Access: \(accessToken ?? "nil")")
print("Refresh: \(refreshToken ?? "nil")")

