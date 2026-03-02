import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published var user: SessionUser?
    @Published var tokens: SessionTokens?
    @Published private(set) var refreshingSession = false
    @Published private(set) var requiresNicknameSetup = false

    private var nicknameOnboardedUserIDs: Set<String>
    private var nicknameSetupRequiredUserIDs: Set<String>

    private enum Keys {
        static let user = "session_user"
        static let tokens = "session_tokens"
        static let nicknameOnboardedUserIDs = "nickname_onboarded_user_ids_v1"
        static let nicknameSetupRequiredUserIDs = "nickname_setup_required_user_ids_v1"
    }

    init() {
        self.user = Self.decode(SessionUser.self, key: Keys.user)
        self.tokens = Self.decode(SessionTokens.self, key: Keys.tokens)
        self.nicknameOnboardedUserIDs = Set(UserDefaults.standard.stringArray(forKey: Keys.nicknameOnboardedUserIDs) ?? [])
        self.nicknameSetupRequiredUserIDs = Set(UserDefaults.standard.stringArray(forKey: Keys.nicknameSetupRequiredUserIDs) ?? [])
        self.requiresNicknameSetup = Self.shouldRequireNicknameSetup(
            for: user,
            onboardedUserIDs: nicknameOnboardedUserIDs,
            requiredUserIDs: nicknameSetupRequiredUserIDs
        )
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
        let previousUserID = self.user?.id
        self.user = user
        self.tokens = tokens
        Self.encode(user, key: Keys.user)
        Self.encode(tokens, key: Keys.tokens)

        let needsSetup = Self.needsNicknameSetup(for: user)

        if !needsSetup {
            nicknameOnboardedUserIDs.insert(user.id)
            nicknameSetupRequiredUserIDs.remove(user.id)
            persistNicknameOnboardedUserIDs()
            persistNicknameSetupRequiredUserIDs()
        } else if previousUserID != user.id && !nicknameOnboardedUserIDs.contains(user.id) {
            nicknameSetupRequiredUserIDs.insert(user.id)
            persistNicknameSetupRequiredUserIDs()
        }

        requiresNicknameSetup = Self.shouldRequireNicknameSetup(
            for: user,
            onboardedUserIDs: nicknameOnboardedUserIDs,
            requiredUserIDs: nicknameSetupRequiredUserIDs
        )
    }

    func completeNicknameSetup(updatedUser: SessionUser? = nil) {
        guard let activeUser = updatedUser ?? user else { return }

        nicknameOnboardedUserIDs.insert(activeUser.id)
        nicknameSetupRequiredUserIDs.remove(activeUser.id)
        persistNicknameOnboardedUserIDs()
        persistNicknameSetupRequiredUserIDs()

        if let updatedUser {
            self.user = updatedUser
            Self.encode(updatedUser, key: Keys.user)
        }

        requiresNicknameSetup = false
    }

    func updateUser(_ updatedUser: SessionUser) {
        user = updatedUser
        Self.encode(updatedUser, key: Keys.user)
        requiresNicknameSetup = Self.shouldRequireNicknameSetup(
            for: updatedUser,
            onboardedUserIDs: nicknameOnboardedUserIDs,
            requiredUserIDs: nicknameSetupRequiredUserIDs
        )
    }

    func clear() {
        user = nil
        tokens = nil
        requiresNicknameSetup = false
        UserDefaults.standard.removeObject(forKey: Keys.user)
        UserDefaults.standard.removeObject(forKey: Keys.tokens)
    }

    func refreshIfNeeded(baseURL: URL, force: Bool = false) async {
        guard !refreshingSession else { return }
        guard let currentTokens = tokens else { return }

        let refreshToken = currentTokens.refreshToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !refreshToken.isEmpty else { return }

        if !force {
            let now = Int(Date().timeIntervalSince1970)
            if let expiresAt = currentTokens.expiresAt, expiresAt > now + 86_400 {
                return
            }
        }

        refreshingSession = true
        defer { refreshingSession = false }

        do {
            let payload = try await APIClient().refreshSession(baseURL: baseURL, refreshToken: refreshToken)
            save(user: payload.user, tokens: payload.session)
        } catch {
            // Keep current session; fail-open to avoid aggressive logout on transient network issues.
        }
    }

    private static func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func encode<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private static func shouldRequireNicknameSetup(
        for user: SessionUser?,
        onboardedUserIDs: Set<String>,
        requiredUserIDs: Set<String>
    ) -> Bool {
        guard let user else { return false }
        if !needsNicknameSetup(for: user) { return false }
        if onboardedUserIDs.contains(user.id) { return false }
        return requiredUserIDs.contains(user.id)
    }

    private static func needsNicknameSetup(for user: SessionUser) -> Bool {
        let nickname = user.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        if nickname.isEmpty { return true }

        let username = user.username.trimmingCharacters(in: .whitespacesAndNewlines)
        if !username.isEmpty && nickname.caseInsensitiveCompare(username) == .orderedSame {
            return true
        }

        let lower = nickname.lowercased()
        if lower.hasPrefix("user_") {
            return true
        }
        return false
    }

    private func persistNicknameOnboardedUserIDs() {
        UserDefaults.standard.set(Array(nicknameOnboardedUserIDs), forKey: Keys.nicknameOnboardedUserIDs)
    }

    private func persistNicknameSetupRequiredUserIDs() {
        UserDefaults.standard.set(Array(nicknameSetupRequiredUserIDs), forKey: Keys.nicknameSetupRequiredUserIDs)
    }
}
