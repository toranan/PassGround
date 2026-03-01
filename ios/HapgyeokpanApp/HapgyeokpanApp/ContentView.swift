import SwiftUI

private let webPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

enum DesignSystem {
    static let primary = Color(red: 79/255, green: 70/255, blue: 229/255)
    static let background = Color(UIColor.systemGroupedBackground)
    static let cardBackground = Color.white
    static let cardCornerRadius: CGFloat = 16
    static let padding: CGFloat = 16
    static let spacing: CGFloat = 12
}

struct ContentView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore
    @State private var selectedTab: TabSelection = .home
    @State private var loadedTabs: Set<TabSelection> = [.home]

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                ForEach(TabSelection.allCases, id: \.self) { tab in
                    if loadedTabs.contains(tab) {
                        tabRoot(for: tab)
                            .opacity(selectedTab == tab ? 1 : 0)
                            .allowsHitTesting(selectedTab == tab)
                            .accessibilityHidden(selectedTab != tab)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onChange(of: selectedTab) { tab in
                loadedTabs.insert(tab)
            }

            MainBottomTabBar(selectedTab: $selectedTab)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .sheet(
            isPresented: Binding(
                get: { session.isLoggedIn && session.requiresNicknameSetup },
                set: { _ in }
            )
        ) {
            NicknameSetupSheet()
                .environmentObject(config)
                .environmentObject(session)
                .interactiveDismissDisabled(true)
        }
    }

    @ViewBuilder
    private func tabRoot(for tab: TabSelection) -> some View {
        switch tab {
        case .home:
            NavigationStack {
                TransferHomeView()
            }
        case .community:
            NavigationStack {
                CommunityBoardsView()
            }
        case .ranking:
            NavigationStack {
                RankingView()
            }
        case .schedule:
            NavigationStack {
                ScheduleView()
            }
        case .coach:
            NavigationStack {
                ChatCoachView()
            }
        case .mypage:
            NavigationStack {
                MyPageView()
            }
        }
    }
}

enum TabSelection: String, CaseIterable {
    case home = "홈"
    case community = "커뮤니티"
    case ranking = "데이터센터"
    case schedule = "일정"
    case coach = "AI도우미"
    case mypage = "마이"
}

struct MainBottomTabBar: View {
    @Binding var selectedTab: TabSelection

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack {
                TabBarButton(title: "홈", iconName: "house.fill", tab: .home, selectedTab: $selectedTab)
                TabBarButton(title: "커뮤니티", iconName: "text.bubble.fill", tab: .community, selectedTab: $selectedTab)
                TabBarButton(title: "데이터센터", iconName: "chart.bar.fill", tab: .ranking, selectedTab: $selectedTab)
                TabBarButton(title: "일정", iconName: "calendar.badge.clock", tab: .schedule, selectedTab: $selectedTab)
                TabBarButton(title: "AI도우미", iconName: "bubble.left.and.bubble.right.fill", tab: .coach, selectedTab: $selectedTab)
                TabBarButton(title: "마이", iconName: "person.crop.circle.fill", tab: .mypage, selectedTab: $selectedTab)
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(Color(UIColor.systemBackground))
        }
    }
}

private struct NicknameSetupSheet: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()

    @State private var nickname = ""
    @State private var saving = false
    @State private var errorMessage = ""

    private var trimmedNickname: String {
        nickname.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var validationError: String? {
        validateNickname(trimmedNickname)
    }

    private var canSubmit: Bool {
        !saving && validationError == nil
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("처음 로그인했네! 닉네임 한 번만 정해줘.")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)

                Text("커뮤니티와 AI도우미에서 사용할 이름이야.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField("닉네임 입력 (2~20자)", text: $nickname)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(UIColor.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                if let validationError {
                    Text(validationError)
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                } else {
                    Text("한글/영문/숫자/_/공백만 사용할 수 있어.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button {
                    Task { await submitNickname() }
                } label: {
                    Text(saving ? "저장 중..." : "닉네임 저장")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit)

                Spacer(minLength: 0)
            }
            .padding(16)
            .navigationTitle("닉네임 설정")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if nickname.isEmpty {
                    nickname = session.user?.nickname ?? ""
                }
            }
        }
    }

    @MainActor
    private func submitNickname() async {
        guard canSubmit else { return }
        guard let user = session.user else { return }
        guard !session.accessToken.isEmpty else {
            errorMessage = "로그인이 만료됐어. 다시 로그인해줘."
            return
        }

        saving = true
        errorMessage = ""
        defer { saving = false }

        do {
            let updatedUser = try await api.updateNickname(
                baseURL: config.baseURL,
                accessToken: session.accessToken,
                userId: user.id,
                nickname: trimmedNickname
            )
            session.completeNicknameSetup(updatedUser: updatedUser)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func validateNickname(_ value: String) -> String? {
        if value.count < 2 { return "닉네임은 2자 이상이어야 해." }
        if value.count > 20 { return "닉네임은 20자 이하여야 해." }
        let isValid = value.range(of: "^[a-zA-Z0-9가-힣_ ]+$", options: .regularExpression) != nil
        if !isValid { return "특수문자는 사용할 수 없어." }
        return nil
    }
}

private struct ChatMessage: Identifiable {
    enum Role {
        case user
        case assistant
        case system
    }

    let id: UUID
    let role: Role
    var text: String
    var subtitle: String?

    init(id: UUID = UUID(), role: Role, text: String, subtitle: String?) {
        self.id = id
        self.role = role
        self.text = text
        self.subtitle = subtitle
    }
}

private struct ChatCoachView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private struct PendingQuestionSubmission {
        let question: String
        let traceId: String?
    }

    private let api = APIClient()
    private let oauth = OAuthCoordinator()
    private static let assistantName = "합곰이"
    private static let welcomeMessage = """
    안녕! 나는 너 편입 고민 같이 봐줄 합곰이야
    내가 가진 편입 정보랑 검수된 내용 기준으로 최대한 정확하게 도와줄게
    확인 안 되는 건 아는 척 안 하고 솔직하게 말할게
    무조건 괜찮다 이런 말만 하기보다 지금 너한테 진짜 도움 되는 쪽으로 같이 풀어보자
    편하게 물어봐줘!
    """
    private static let loadingMessage = "생각 정리 중..."

    @State private var exam: ExamSlug = .transfer
    @State private var input = ""
    @State private var sending = false
    @State private var pendingDeltaText = ""
    @State private var renderingDelta = false
    @State private var sawStreamSignal = false
    @State private var submittingQuestion = false
    @State private var pendingQuestionSubmission: PendingQuestionSubmission?
    @State private var socialLoginProvider: String?
    @FocusState private var inputFocused: Bool
    @State private var messages: [ChatMessage] = [
        ChatMessage(
            role: .assistant,
            text: ChatCoachView.welcomeMessage,
            subtitle: ChatCoachView.assistantName
        )
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(messages) { message in
                            chatBubble(message)
                                .id(message.id)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                }
                .contentShape(Rectangle())
                .background(Color(UIColor.systemGroupedBackground))
                .onTapGesture {
                    inputFocused = false
                }
                .onChange(of: messages.count) { _ in
                    if let last = messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            if !session.isLoggedIn {
                coachLoginPanel
            }

            Divider()
            VStack(spacing: 8) {
                if pendingQuestionSubmission != nil {
                    questionSubmissionBar
                }
                inputBar
            }
            .padding(.top, 8)
            .background(Color(UIColor.systemBackground))
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("AI 도우미")
                    .font(.title3.weight(.bold))
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("새 대화") {
                    resetConversation()
                }
                .font(.caption.weight(.semibold))
            }
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(session.isLoggedIn ? "메시지를 입력해줘" : "로그인 후 이용 가능해", text: $input, axis: .vertical)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .lineLimit(1...4)
                .focused($inputFocused)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color(UIColor.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(canSend ? webPrimary : .gray)
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var questionSubmissionBar: some View {
        HStack(spacing: 8) {
            Text("정보가 없어서 답변을 못했어. 질문 접수할래?")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button {
                Task { await submitPendingQuestion() }
            } label: {
                Text(submittingQuestion ? "접수 중..." : "질문하기")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(submittingQuestion)
        }
        .padding(.horizontal, 12)
    }

    private var coachLoginPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AI도우미는 로그인 후 사용할 수 있어. 아래에서 바로 로그인해줘.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                socialLoginButton(provider: "kakao", title: "카카오", icon: "message.fill")
                    .tint(Color(red: 254/255, green: 229/255, blue: 0/255))
                    .foregroundStyle(Color.black.opacity(0.85))
                socialLoginButton(provider: "apple", title: "Apple", icon: "applelogo")
                    .tint(.black)
                    .foregroundStyle(.white)
                socialLoginButton(provider: "google", title: "Google", icon: "globe")
                    .tint(.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
                    .foregroundStyle(.black)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    private func socialLoginButton(provider: String, title: String, icon: String) -> some View {
        Button {
            Task { await loginForCoach(provider: provider) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(socialLoginProvider == provider ? "로그인 중..." : title)
                    .lineLimit(1)
            }
            .font(.caption.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(socialLoginProvider != nil)
    }

    private var canSend: Bool {
        session.isLoggedIn && !sending && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hasUserMessage: Bool {
        messages.contains { $0.role == .user }
    }

    private func isWelcomeMessage(_ message: ChatMessage) -> Bool {
        guard let firstId = messages.first?.id else { return false }
        return !hasUserMessage
            && message.id == firstId
            && message.role != .user
            && message.text == ChatCoachView.welcomeMessage
    }

    @ViewBuilder
    private var hapgomAvatar: some View {
        if let image = UIImage(named: "hapgom-avatar") {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 140, height: 140)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 2))
                .shadow(color: webPrimary.opacity(0.25), radius: 14, x: 0, y: 8)
        } else {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(red: 190/255, green: 232/255, blue: 85/255), webPrimary.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 140, height: 140)
                .overlay(
                    Image(systemName: "face.smiling.inverse")
                        .font(.system(size: 52, weight: .semibold))
                        .foregroundStyle(.white)
                )
                .shadow(color: webPrimary.opacity(0.25), radius: 14, x: 0, y: 8)
        }
    }

    @ViewBuilder
    private var hapgomSmallAvatar: some View {
        if let image = UIImage(named: "hapgom-avatar") {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 28, height: 28)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 1))
        } else {
            Circle()
                .fill(Color(red: 190/255, green: 232/255, blue: 85/255))
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "face.smiling.inverse")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                )
        }
    }

    @ViewBuilder
    private func chatBubble(_ message: ChatMessage) -> some View {
        if isWelcomeMessage(message) {
            VStack(spacing: 10) {
                hapgomAvatar
                if let subtitle = message.subtitle {
                    Text(subtitle)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(message.text)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.black.opacity(0.04), lineWidth: 1)
                    )
            }
            .padding(.top, 6)
            .frame(maxWidth: .infinity)
        } else {
            switch message.role {
            case .user:
                HStack {
                    Spacer(minLength: 40)
                    VStack(alignment: .trailing, spacing: 4) {
                        if let subtitle = message.subtitle {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Text(message.text)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(webPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
            case .assistant, .system:
                HStack(alignment: .top, spacing: 8) {
                    hapgomSmallAvatar
                        .padding(.top, 4)
                    VStack(alignment: .leading, spacing: 4) {
                        if let subtitle = message.subtitle {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Text(message.text)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    Spacer(minLength: 40)
                }
            }
        }
    }

    private func resetConversation() {
        messages = [
            ChatMessage(
                role: .assistant,
                text: ChatCoachView.welcomeMessage,
                subtitle: ChatCoachView.assistantName
            )
        ]
        input = ""
        inputFocused = false
        pendingDeltaText = ""
        renderingDelta = false
        submittingQuestion = false
        pendingQuestionSubmission = nil
    }

    @MainActor
    private func sendMessage() async {
        let question = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !sending else { return }
        let historyMessages = buildHistoryMessages(limit: 8)
        guard session.isLoggedIn else {
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "AI도우미는 로그인 후 사용할 수 있어. 마이페이지에서 먼저 로그인해줘.",
                    subtitle: ChatCoachView.assistantName
                )
            )
            return
        }

        sending = true
        defer { sending = false }

        await session.refreshIfNeeded(baseURL: config.baseURL)
        let accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "세션을 확인하지 못했어. 마이페이지에서 다시 로그인해줘.",
                    subtitle: ChatCoachView.assistantName
                )
            )
            return
        }

        let requestStartedAt = Date()

        input = ""
        inputFocused = false
        pendingDeltaText = ""
        renderingDelta = false
        sawStreamSignal = false
        pendingQuestionSubmission = nil
        messages.append(ChatMessage(role: .user, text: question, subtitle: nil))
        let assistantId = UUID()
        messages.append(
            ChatMessage(
                id: assistantId,
                role: .assistant,
                text: ChatCoachView.loadingMessage,
                subtitle: ChatCoachView.assistantName
            )
        )

        do {
            let response = try await api.chatStream(
                baseURL: config.baseURL,
                exam: exam,
                question: question,
                messages: historyMessages,
                accessToken: accessToken
            ) { event in
                Task { @MainActor in
                    handleStreamEvent(event, assistantId: assistantId)
                }
            }
            await ensureMinimumLoadingVisible(since: requestStartedAt)

            var shouldTypeFinal = false
            updateAssistantMessage(id: assistantId) { message in
                if message.text == ChatCoachView.loadingMessage ||
                    message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    shouldTypeFinal = true
                    message.text = ""
                }
            }
            if shouldTypeFinal, !response.answer.isEmpty {
                appendDelta(response.answer, assistantId: assistantId)
            }
            pendingQuestionSubmission = response.needsQuestionSubmission == true
                ? PendingQuestionSubmission(question: question, traceId: response.traceId)
                : nil
        } catch {
            let streamError = error
            if sawStreamSignal {
                if streamError.localizedDescription.contains("HTTP 401") {
                    updateAssistantMessage(id: assistantId) { message in
                        message.text = "로그인이 만료됐어. 마이페이지에서 다시 로그인해줘."
                        message.subtitle = ChatCoachView.assistantName
                    }
                } else {
                    updateAssistantMessage(id: assistantId) { message in
                        if message.text == ChatCoachView.loadingMessage {
                            message.text = "응답 도중 연결이 끊겼어. 한 번만 다시 보내줘."
                        }
                        message.subtitle = ChatCoachView.assistantName
                    }
                }
                return
            }
            do {
                let fallback = try await api.chat(
                    baseURL: config.baseURL,
                    exam: exam,
                    question: question,
                    messages: historyMessages,
                    accessToken: accessToken
                )
                await ensureMinimumLoadingVisible(since: requestStartedAt)

                var shouldTypeFallback = false
                updateAssistantMessage(id: assistantId) { message in
                    if message.text == ChatCoachView.loadingMessage ||
                        message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        shouldTypeFallback = true
                        message.text = ""
                    }
                }
                if shouldTypeFallback, !fallback.answer.isEmpty {
                    appendDelta(fallback.answer, assistantId: assistantId)
                }
                pendingQuestionSubmission = fallback.needsQuestionSubmission == true
                    ? PendingQuestionSubmission(question: question, traceId: fallback.traceId)
                    : nil
            } catch {
                let isUnauthorized =
                    streamError.localizedDescription.contains("HTTP 401")
                    || error.localizedDescription.contains("HTTP 401")
                updateAssistantMessage(id: assistantId) { message in
                    if isUnauthorized {
                        message.text = "로그인이 만료됐어. 마이페이지에서 다시 로그인해줘."
                    } else {
                        message.text = "요청에 실패했어. 네트워크 상태를 확인하고 다시 시도해줘."
                    }
                    message.subtitle = ChatCoachView.assistantName
                }
            }
        }

    }

    private func buildHistoryMessages(limit: Int) -> [AIChatHistoryMessage] {
        let history = messages.compactMap { message -> AIChatHistoryMessage? in
            let text = message.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            switch message.role {
            case .user:
                return AIChatHistoryMessage(role: "user", text: text)
            case .assistant:
                if text == ChatCoachView.welcomeMessage || text == ChatCoachView.loadingMessage {
                    return nil
                }
                return AIChatHistoryMessage(role: "assistant", text: text)
            case .system:
                return nil
            }
        }
        if history.count <= limit { return history }
        return Array(history.suffix(limit))
    }

    @MainActor
    private func loginForCoach(provider: String) async {
        guard socialLoginProvider == nil else { return }
        socialLoginProvider = provider
        defer { socialLoginProvider = nil }

        do {
            let authResponse = try await resolveCoachAuthResponse(provider: provider)

            session.save(user: authResponse.user, tokens: authResponse.session)
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "로그인 완료! 이제 바로 물어봐줘.",
                    subtitle: ChatCoachView.assistantName
                )
            )
        } catch {
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "로그인에 실패했어. 잠시 후 다시 시도해줘.",
                    subtitle: ChatCoachView.assistantName
                )
            )
        }
    }

    private func resolveCoachAuthResponse(provider: String) async throws -> OAuthExchangeResponse {
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

    @MainActor
    private func ensureMinimumLoadingVisible(since startedAt: Date, minimumMs: Double = 450) async {
        let elapsedMs = Date().timeIntervalSince(startedAt) * 1000
        let remainMs = minimumMs - elapsedMs
        if remainMs > 0 {
            let nanos = UInt64(remainMs * 1_000_000)
            try? await Task.sleep(nanoseconds: nanos)
        }
    }

    @MainActor
    private func handleStreamEvent(_ event: AIChatStreamEvent, assistantId: UUID) {
        sawStreamSignal = true
        switch event {
        case .ready:
            break
        case .meta:
            break
        case .delta(let text):
            appendDelta(text, assistantId: assistantId)
        case .done:
            updateAssistantMessage(id: assistantId) { message in
                if message.text == ChatCoachView.loadingMessage {
                    message.text = ""
                }
            }
        }
    }

    @MainActor
    private func appendDelta(_ text: String, assistantId: UUID) {
        guard !text.isEmpty else { return }
        pendingDeltaText += text
        guard !renderingDelta else { return }

        renderingDelta = true
        Task { @MainActor in
            while !pendingDeltaText.isEmpty {
                let next = String(pendingDeltaText.removeFirst())
                updateAssistantMessage(id: assistantId) { message in
                    if message.text == ChatCoachView.loadingMessage {
                        message.text = ""
                    }
                    message.text += next
                }
                try? await Task.sleep(nanoseconds: 10_000_000)
            }
            renderingDelta = false
        }
    }

    @MainActor
    private func updateAssistantMessage(id: UUID, mutate: (inout ChatMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        var message = messages[index]
        mutate(&message)
        messages[index] = message
    }

    @MainActor
    private func submitPendingQuestion() async {
        guard !submittingQuestion else { return }
        guard let pending = pendingQuestionSubmission else { return }
        await session.refreshIfNeeded(baseURL: config.baseURL)
        var accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "질문 접수는 로그인 후 가능해. 마이페이지에서 먼저 로그인해줘.",
                    subtitle: ChatCoachView.assistantName
                )
            )
            return
        }

        submittingQuestion = true
        defer { submittingQuestion = false }

        do {
            try await submitQuestionRequest(pending: pending, accessToken: accessToken)
        } catch {
            let isUnauthorized = error.localizedDescription.contains("HTTP 401")
            if isUnauthorized {
                await session.refreshIfNeeded(baseURL: config.baseURL, force: true)
                accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
                if !accessToken.isEmpty {
                    do {
                        try await submitQuestionRequest(pending: pending, accessToken: accessToken)
                        return
                    } catch {
                        // fall through to message below
                    }
                }
            }

            let messageText = isUnauthorized
                ? "세션이 만료된 것 같아. 마이페이지에서 다시 로그인하고 눌러줘."
                : "질문 접수에 실패했어. 잠시 후 다시 눌러줘."
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: messageText,
                    subtitle: ChatCoachView.assistantName
                )
            )
        }
    }

    @MainActor
    private func submitQuestionRequest(
        pending: PendingQuestionSubmission,
        accessToken: String
    ) async throws {
        let payload = try await api.submitAIQuestion(
            baseURL: config.baseURL,
            exam: exam,
            question: pending.question,
            traceId: pending.traceId,
            accessToken: accessToken
        )
        messages.append(
            ChatMessage(
                role: .assistant,
                text: payload.message ?? "질문 접수 완료! 등록된 이메일로 답변 준비해둘게.",
                subtitle: ChatCoachView.assistantName
            )
        )
        pendingQuestionSubmission = nil
    }
}

struct TabBarButton: View {
    let title: String
    let iconName: String
    let tab: TabSelection
    @Binding var selectedTab: TabSelection

    var body: some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: iconName)
                    .font(.system(size: 20))
                    .foregroundColor(selectedTab == tab ? webPrimary : .gray)
                Text(title)
                    .font(.system(size: 10))
                    .foregroundColor(selectedTab == tab ? webPrimary : .gray)
            }
            .frame(maxWidth: .infinity)
        }
    }
}
