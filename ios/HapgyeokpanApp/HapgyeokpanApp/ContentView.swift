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
    case ranking = "랭킹"
    case schedule = "일정"
    case coach = "코치"
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
                TabBarButton(title: "랭킹", iconName: "chart.bar.fill", tab: .ranking, selectedTab: $selectedTab)
                TabBarButton(title: "일정", iconName: "calendar.badge.clock", tab: .schedule, selectedTab: $selectedTab)
                TabBarButton(title: "코치", iconName: "bubble.left.and.bubble.right.fill", tab: .coach, selectedTab: $selectedTab)
                TabBarButton(title: "마이", iconName: "person.crop.circle.fill", tab: .mypage, selectedTab: $selectedTab)
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(Color(UIColor.systemBackground))
        }
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

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var input = ""
    @State private var sending = false
    @State private var messages: [ChatMessage] = [
        ChatMessage(
            role: .assistant,
            text: "안녕하세요. 편입 코치예요. 지금 고민을 짧게 말해주면 바로 전략으로 정리해줄게요.",
            subtitle: "AI 코치"
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

                        if sending {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("답변 생성 중...")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                }
                .background(Color(UIColor.systemGroupedBackground))
                .onChange(of: messages.count) { _ in
                    if let last = messages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()
            inputBar
                .background(Color(UIColor.systemBackground))
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("AI 코치")
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
            TextField("예: 모의고사 망쳐서 멘탈이 흔들려", text: $input, axis: .vertical)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .lineLimit(1...4)
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

    private var canSend: Bool {
        !sending && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @ViewBuilder
    private func chatBubble(_ message: ChatMessage) -> some View {
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
            HStack {
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

    private func resetConversation() {
        messages = [
            ChatMessage(
                role: .assistant,
                text: "대화를 새로 시작했어요. 지금 가장 급한 고민 하나만 말해줘요.",
                subtitle: "AI 코치"
            )
        ]
        input = ""
    }

    @MainActor
    private func sendMessage() async {
        let question = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !sending else { return }

        input = ""
        sending = true
        messages.append(ChatMessage(role: .user, text: question, subtitle: nil))
        let assistantId = UUID()
        messages.append(
            ChatMessage(
                id: assistantId,
                role: .assistant,
                text: "",
                subtitle: "답변 생성 중..."
            )
        )

        do {
            let response = try await api.chatStream(
                baseURL: config.baseURL,
                exam: exam,
                question: question
            ) { event in
                Task { @MainActor in
                    handleStreamEvent(event, assistantId: assistantId)
                }
            }

            updateAssistantMessage(id: assistantId) { message in
                if message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    message.text = response.answer
                }
                message.subtitle = makeSubtitle(from: response)
            }
        } catch {
            let streamError = error
            do {
                let fallback = try await api.chat(
                    baseURL: config.baseURL,
                    exam: exam,
                    question: question
                )
                updateAssistantMessage(id: assistantId) { message in
                    if message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        message.text = fallback.answer
                    }
                    message.subtitle = "\(makeSubtitle(from: fallback)) · fallback"
                }
            } catch {
                updateAssistantMessage(id: assistantId) { message in
                    message.text = """
                    요청에 실패했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.
                    stream: \(streamError.localizedDescription)
                    fallback: \(error.localizedDescription)
                    """
                    message.subtitle = "오류"
                }
            }
        }

        sending = false
    }

    @MainActor
    private func handleStreamEvent(_ event: AIChatStreamEvent, assistantId: UUID) {
        switch event {
        case .ready(let traceId):
            guard let traceId, !traceId.isEmpty else { return }
            updateAssistantMessage(id: assistantId) { message in
                message.subtitle = "연결됨 · trace \(traceId.prefix(6))"
            }
        case .meta(_, let route, let cache):
            updateAssistantMessage(id: assistantId) { message in
                var parts: [String] = []
                if let route, !route.isEmpty {
                    parts.append("route: \(route)")
                }
                if let cache, !cache.isEmpty {
                    parts.append("cache: \(cache)")
                }
                if !parts.isEmpty {
                    message.subtitle = parts.joined(separator: " · ")
                }
            }
        case .delta(let text):
            updateAssistantMessage(id: assistantId) { message in
                message.text += text
            }
        case .done(let payload):
            updateAssistantMessage(id: assistantId) { message in
                if message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    message.text = payload.answer
                }
                message.subtitle = makeSubtitle(from: payload)
            }
        }
    }

    @MainActor
    private func updateAssistantMessage(id: UUID, mutate: (inout ChatMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        var message = messages[index]
        mutate(&message)
        messages[index] = message
    }

    private func makeSubtitle(from response: AIChatResponse) -> String {
        [
            "route: \(response.route)",
            response.cache.map { "cache: \($0)" } ?? nil,
            "\(response.contexts.count)개 근거"
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
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
