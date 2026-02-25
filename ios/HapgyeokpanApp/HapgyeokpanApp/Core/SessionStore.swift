import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published var user: SessionUser?
    @Published var tokens: SessionTokens?

    private enum Keys {
        static let user = "session_user"
        static let tokens = "session_tokens"
    }

    init() {
        self.user = Self.decode(SessionUser.self, key: Keys.user)
        self.tokens = Self.decode(SessionTokens.self, key: Keys.tokens)
    }

    var isLoggedIn: Bool {
        user != nil && tokens != nil
    }

    var accessToken: String {
        tokens?.accessToken ?? ""
    }

    var displayName: String {
        user?.nickname.isEmpty == false ? user!.nickname : (user?.username ?? "")
    }

    func save(user: SessionUser, tokens: SessionTokens) {
        self.user = user
        self.tokens = tokens
        Self.encode(user, key: Keys.user)
        Self.encode(tokens, key: Keys.tokens)
    }

    func clear() {
        user = nil
        tokens = nil
        UserDefaults.standard.removeObject(forKey: Keys.user)
        UserDefaults.standard.removeObject(forKey: Keys.tokens)
    }

    private static func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func encode<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
