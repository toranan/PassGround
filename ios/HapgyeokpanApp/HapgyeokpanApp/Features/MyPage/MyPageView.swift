import SwiftUI

struct MyPageView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()
    private let oauth = OAuthCoordinator()

    @State private var pointsData: PointResponse?
    @State private var nicknameInput = ""
    @State private var message = ""
    @State private var loading = false

    @State private var adminState: AdminMeResponse?
    @State private var unreadNotificationCount = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header
                HStack {
                    Text("전체 메뉴")
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                }
                .padding(.horizontal, DesignSystem.padding)
                .padding(.top, 10)
                
                if !session.isLoggedIn {
                    loginSection
                } else {
                    profileSection
                    pointLedgerSection
                    accountSection
                }

                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(message.contains("실패") || message.contains("오류") ? .red : .green)
                        .padding()
                }
                
                Spacer(minLength: 40)
            }
            .padding(.vertical, 10)
        }
        .background(DesignSystem.background)
        .navigationTitle("")
        .navigationBarHidden(true)
        .task {
            nicknameInput = session.user?.nickname ?? ""
            await refreshData()
        }
        .refreshable {
            await refreshData()
        }
    }
    
    // MARK: - Login Section
    private var loginSection: some View {
        VStack(spacing: 16) {
            Text("소셜 계정으로 로그인하고\n더 많은 기능을 이용해 보세요.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.top, 10)
            
            Button(action: { Task { await login(provider: "kakao") } }) {
                HStack {
                    Image(systemName: "message.fill")
                    Text("카카오 로그인")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(red: 254/255, green: 229/255, blue: 0/255))
                .foregroundColor(Color.black.opacity(0.85))
                .cornerRadius(12)
            }

            Button(action: { Task { await login(provider: "apple") } }) {
                HStack {
                    Image(systemName: "applelogo")
                    Text("Apple로 로그인")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.black)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            
            Button(action: { Task { await login(provider: "google") } }) {
                HStack {
                    Image(systemName: "globe")
                    Text("구글 로그인")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.white)
                .foregroundColor(.black)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.3), lineWidth: 1))
            }
        }
        .padding(DesignSystem.padding)
        .background(DesignSystem.cardBackground)
        .cornerRadius(DesignSystem.cardCornerRadius)
        .padding(.horizontal, DesignSystem.padding)
    }
    
    // MARK: - Profile Section
    private var profileSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                Circle()
                    .fill(Color(UIColor.systemGray5))
                    .frame(width: 50, height: 50)
                    .overlay(Image(systemName: "person.fill").foregroundColor(.gray))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.user?.nickname ?? "회원님")
                        .font(.title3)
                        .fontWeight(.bold)
                    Text(session.user?.email ?? "-")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            
            Divider()
            
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("보유 포인트")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(pointsData?.points ?? 0) P")
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(DesignSystem.primary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("인증 상태")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(pointsData?.verificationLevel ?? "-")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                }
            }
        }
        .padding(DesignSystem.padding)
        .background(DesignSystem.cardBackground)
        .cornerRadius(DesignSystem.cardCornerRadius)
        .padding(.horizontal, DesignSystem.padding)
    }
    
    // MARK: - Point Ledger Section
    private var pointLedgerSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("최근 포인트 내역")
                .font(.headline)
                .padding(.horizontal, DesignSystem.padding)
                .padding(.bottom, 12)
            
            VStack(spacing: 0) {
                if let pointsData, !pointsData.ledger.isEmpty {
                    let items = Array(pointsData.ledger.prefix(5))
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, row in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(row.source)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text(row.createdAt)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, DesignSystem.padding)
                        .padding(.vertical, 12)
                        
                        if index < items.count - 1 {
                            Divider().padding(.leading, DesignSystem.padding)
                        }
                    }
                } else {
                    Text("포인트 내역이 없습니다.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(30)
                        .frame(maxWidth: .infinity)
                }
            }
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .padding(.horizontal, DesignSystem.padding)
        }
    }
    
    // MARK: - Account Section
    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("내 정보 관리")
                .font(.headline)
                .padding(.horizontal, DesignSystem.padding)
                .padding(.bottom, 12)
            
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "pencil")
                        .frame(width: 24)
                        .foregroundColor(.gray)
                    TextField("닉네임 변경", text: $nicknameInput)
                        .font(.subheadline)
                    Spacer()
                    Button("저장") {
                        Task { await saveNickname() }
                    }
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(DesignSystem.primary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(DesignSystem.primary.opacity(0.1))
                    .cornerRadius(8)
                }
                .padding(.horizontal, DesignSystem.padding)
                .padding(.vertical, 12)
                
                Divider().padding(.leading, DesignSystem.padding + 32)
                
                NavigationLink(destination: VerificationView()) {
                    HStack {
                        Image(systemName: "checkmark.seal.fill")
                            .frame(width: 24)
                            .foregroundColor(.gray)
                        Text("합격증 인증 신청하기")
                            .font(.subheadline)
                            .foregroundColor(.primary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal, DesignSystem.padding)
                    .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                
                
                Button(action: {
                    session.clear()
                    pointsData = nil
                    adminState = nil
                    unreadNotificationCount = 0
                }) {
                    HStack {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .frame(width: 24)
                            .foregroundColor(.red)
                        Text("로그아웃")
                            .font(.subheadline)
                            .foregroundColor(.red)
                        Spacer()
                    }
                    .padding(.horizontal, DesignSystem.padding)
                    .padding(.vertical, 14)
                }
            }
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .padding(.horizontal, DesignSystem.padding)
        }
    }
    
    // MARK: - Handlers
    private func refreshData() async {
        guard session.isLoggedIn else { return }

        loading = true
        do {
            async let pointsTask = api.fetchPoints(
                baseURL: config.baseURL,
                userId: session.user?.id,
                nickname: session.displayName
            )
            async let adminTask = api.fetchAdminMe(
                baseURL: config.baseURL,
                accessToken: session.accessToken
            )

            pointsData = try await pointsTask
            adminState = try? await adminTask
            await refreshUnreadNotificationCount()
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    @MainActor
    private func refreshUnreadNotificationCount() async {
        guard let userId = session.user?.id else {
            unreadNotificationCount = 0
            return
        }
        guard !session.accessToken.isEmpty else {
            unreadNotificationCount = 0
            return
        }

        do {
            let response = try await api.fetchNotifications(
                baseURL: config.baseURL,
                userId: userId,
                accessToken: session.accessToken,
                limit: 1
            )
            unreadNotificationCount = response.unreadCount
        } catch {
            if APIClient.isCancellationError(error) { return }
        }
    }

    private func login(provider: String) async {
        loading = true
        message = ""

        do {
            let authResponse = try await resolveAuthResponse(provider: provider)
            
            session.save(user: authResponse.user, tokens: authResponse.session)
            nicknameInput = authResponse.user.nickname
            message = "로그인 완료"
            loading = false
            Task { await refreshData() }
            return
        } catch {
            message = error.localizedDescription
        }

        loading = false
    }

    private func resolveAuthResponse(provider: String) async throws -> OAuthExchangeResponse {
        if provider == "apple" {
            let native = try await oauth.startAppleNative()
            return try await api.finalizeAppleNative(
                baseURL: config.baseURL,
                idToken: native.idToken,
                rawNonce: native.rawNonce,
                authorizationCode: native.authorizationCode
            )
        }

        let result = try await oauth.start(provider: provider, baseURL: config.baseURL)
        switch result {
        case .pkcePayload(let response):
            return response
        case .implicitTokens(let access, let refresh):
            return try await api.finalizeOAuth(
                baseURL: config.baseURL,
                accessToken: access,
                refreshToken: refresh
            )
        }
    }

    private func saveNickname() async {
        guard let user = session.user else { return }
        do {
            let updatedUser = try await api.updateNickname(
                baseURL: config.baseURL,
                accessToken: session.accessToken,
                userId: user.id,
                nickname: nicknameInput
            )
            session.completeNicknameSetup(updatedUser: updatedUser)
            message = "닉네임 저장 완료"
            await refreshData()
        } catch {
            message = error.localizedDescription
        }
    }
}
