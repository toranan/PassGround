import Foundation

final class AppConfig: ObservableObject {
    @Published var baseURLString: String {
        didSet {
            UserDefaults.standard.set(baseURLString, forKey: Self.baseURLKey)
        }
    }

    static let baseURLKey = "api_base_url"
    private static let defaultBaseURLString = "https://pass-ground.vercel.app"

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.baseURLKey)
        let trimmed = stored?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty || trimmed == "https://hapgyeokpan.kr" || trimmed == "hapgyeokpan.kr" {
            self.baseURLString = Self.defaultBaseURLString
        } else {
            self.baseURLString = trimmed
        }
    }

    var baseURL: URL {
        let raw = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized: String

        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            normalized = raw
        } else if raw.hasPrefix("localhost")
                    || raw.hasPrefix("127.0.0.1")
                    || raw.hasPrefix("192.168.")
                    || raw.hasPrefix("10.") {
            normalized = "http://\(raw)"
        } else {
            normalized = "https://\(raw)"
        }

        return URL(string: normalized) ?? URL(string: Self.defaultBaseURLString)!
    }
}
