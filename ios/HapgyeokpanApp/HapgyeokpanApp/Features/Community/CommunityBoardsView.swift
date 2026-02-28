import SwiftUI

private let communityPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

struct CommunityBoardsView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var communityStore: CommunityStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var boards: [BoardInfo] = []
    @State private var writable = true
    @State private var loading = false
    @State private var message = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast
    @State private var showingNotifications = false
    @State private var unreadNotificationCount = 0
    @State private var lastNotificationRefreshAt = Date.distantPast

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }

                boardsList
                    .padding(.top, 16)
            }
            .padding(.bottom, 20)
        }
        .background(Color.white)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("커뮤니티")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)
            }
            ToolbarItem(placement: .topBarTrailing) {
                if session.isLoggedIn {
                    notificationButton
                }
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            let fresh = applyCachedSnapshotIfAvailable()
            if !fresh {
                await loadBoards()
            }
            await loadUnreadNotificationCount(forceRefresh: true)
        }
        .onAppear {
            refreshBoardsIfStale()
            refreshNotificationBadgeIfStale()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                refreshBoardsIfStale()
                refreshNotificationBadgeIfStale()
            }
        }
        .refreshable {
            await loadBoards(forceRefresh: true)
            await loadUnreadNotificationCount(forceRefresh: true)
        }
        .sheet(isPresented: $showingNotifications, onDismiss: {
            Task { await loadUnreadNotificationCount(forceRefresh: true) }
        }) {
            NavigationStack {
                CommunityNotificationsSheet()
                    .environmentObject(config)
                    .environmentObject(session)
            }
        }
    }

    private var boardsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if boards.isEmpty {
                if !loading {
                    Text("표시할 게시판이 없습니다.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 20)
                }
            } else {
                let rows = boards
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, board in
                    NavigationLink {
                        BoardPostsView(exam: exam, board: board, writable: writable)
                    } label: {
                        boardRow(board)
                    }
                    .buttonStyle(.plain)

                    if index < rows.count - 1 {
                        Divider()
                            .padding(.horizontal, 20)
                    }
                }
            }
        }
    }

    private var notificationButton: some View {
        Button {
            showingNotifications = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                if unreadNotificationCount > 0 {
                    Text(unreadNotificationCount > 99 ? "99+" : "\(unreadNotificationCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, unreadNotificationCount > 9 ? 5 : 4)
                        .padding(.vertical, 1)
                        .background(Color.red, in: Capsule())
                        .offset(x: 10, y: -8)
                }
            }
            .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("알림")
    }

    private func boardRow(_ board: BoardInfo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(board.name)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                Spacer()
                Text("\(board.preview.count)개")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(board.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let first = board.preview.first {
                HStack(spacing: 6) {
                    Circle()
                        .fill(communityPrimary)
                        .frame(width: 4, height: 4)
                    Text(first.title)
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer()
                    Text(first.timeLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
    }

    private func loadBoards(forceRefresh: Bool = false) async {
        if loading { return }
        loading = true
        message = ""
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        do {
            let response = try await api.fetchBoards(baseURL: config.baseURL, exam: exam, cachePolicy: cachePolicy)
            let resolvedBoards = response.boards.isEmpty ? fallbackBoards(for: exam) : response.boards
            boards = resolvedBoards
            writable = response.writable
            communityStore.saveBoardsSnapshot(exam: exam, boards: resolvedBoards, writable: writable)
            if response.boards.isEmpty {
                message = "기본 게시판 목록을 표시합니다."
            }
        } catch {
            if isCancellation(error) {
                loading = false
                return
            }
            if boards.isEmpty {
                boards = fallbackBoards(for: exam)
            }
            message = readableErrorMessage(error)
        }
        loading = false
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.boardsSnapshot(exam: exam) else {
            return false
        }
        boards = snapshot.boards
        writable = snapshot.writable
        message = ""
        return Date().timeIntervalSince(snapshot.updatedAt) <= CommunityStore.boardsFreshWindow
    }

    private func refreshBoardsIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        guard !fresh, !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await loadBoards() }
    }

    private func refreshNotificationBadgeIfStale() {
        guard session.isLoggedIn else {
            unreadNotificationCount = 0
            return
        }

        let now = Date()
        guard now.timeIntervalSince(lastNotificationRefreshAt) > 8 else { return }
        Task { await loadUnreadNotificationCount() }
    }

    private func loadUnreadNotificationCount(forceRefresh: Bool = false) async {
        guard let userID = session.user?.id else {
            unreadNotificationCount = 0
            return
        }
        guard !session.accessToken.isEmpty else {
            unreadNotificationCount = 0
            return
        }

        if !forceRefresh {
            let now = Date()
            if now.timeIntervalSince(lastNotificationRefreshAt) <= 8 {
                return
            }
        }

        do {
            let response = try await api.fetchNotifications(
                baseURL: config.baseURL,
                userId: userID,
                accessToken: session.accessToken,
                limit: 1
            )
            unreadNotificationCount = response.unreadCount
            lastNotificationRefreshAt = Date()
        } catch {
            if isCancellation(error) { return }
        }
    }

    private func fallbackBoards(for exam: ExamSlug) -> [BoardInfo] {
        _ = exam
        return [
            BoardInfo(id: "transfer-free", slug: "free", name: "자유게시판", description: "수험생 일상/멘탈/루틴 공유", preview: []),
            BoardInfo(id: "transfer-qa", slug: "qa", name: "학습법공유", description: "대학/전형/학습 전략 질문과 답변", preview: []),
            BoardInfo(id: "transfer-study-qa", slug: "study-qa", name: "학습질문", description: "영어/수학/논술 과목별 공부법 질문과 답변", preview: []),
            BoardInfo(id: "transfer-admit", slug: "admit-review", name: "합격수기", description: "합격생 인증 기반 수기와 노하우", preview: [])
        ]
    }

    private func readableErrorMessage(_ error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cannotFindHost, .cannotConnectToHost:
                return "서버에 연결할 수 없습니다. 인터넷 설정이나 서버 주소를 확인해 주세요."
            case .notConnectedToInternet:
                return "인터넷 연결을 확인해 주세요."
            default:
                return urlError.localizedDescription
            }
        }
        return error.localizedDescription
    }

    private func isCancellation(_ error: Error) -> Bool {
        APIClient.isCancellationError(error)
    }
}

private struct CommunityNotificationsSheet: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    private let api = APIClient()

    @State private var items: [CommunityNotificationItem] = []
    @State private var unreadCount = 0
    @State private var loading = false
    @State private var message = ""
    @State private var didBootstrap = false

    var body: some View {
        List {
            if !message.isEmpty {
                Section {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            if items.isEmpty && !loading {
                Section {
                    Text("새 알림이 없어.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                Section {
                    ForEach(items) { item in
                        notificationRow(item)
                    }
                } header: {
                    if unreadCount > 0 {
                        Text("읽지 않은 알림 \(unreadCount)개")
                    } else {
                        Text("전체 알림")
                    }
                }
            }
        }
        .overlay {
            if loading && items.isEmpty {
                ProgressView("알림 불러오는 중...")
            }
        }
        .navigationTitle("알림")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("닫기") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if unreadCount > 0 {
                    Button("모두 읽음") {
                        Task { await markAllRead() }
                    }
                    .font(.caption.weight(.semibold))
                }
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            await load()
        }
        .refreshable {
            await load(forceRefresh: true)
        }
    }

    private func notificationRow(_ item: CommunityNotificationItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                if !item.isRead {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 8, height: 8)
                        .padding(.top, 4)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    if !item.body.isEmpty {
                        Text(item.body)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Text(item.timeLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @MainActor
    private func load(forceRefresh: Bool = false) async {
        guard let userID = session.user?.id else {
            items = []
            unreadCount = 0
            message = "로그인 후 알림을 확인할 수 있어."
            return
        }
        guard !session.accessToken.isEmpty else {
            items = []
            unreadCount = 0
            message = "로그인이 만료됐어. 다시 로그인해줘."
            return
        }

        if loading && !forceRefresh { return }
        loading = true
        message = ""
        defer { loading = false }

        do {
            let response = try await api.fetchNotifications(
                baseURL: config.baseURL,
                userId: userID,
                accessToken: session.accessToken,
                limit: 60
            )
            items = response.items
            unreadCount = response.unreadCount
        } catch {
            if isCancellation(error) { return }
            message = error.localizedDescription
        }
    }

    @MainActor
    private func markAllRead() async {
        guard !session.accessToken.isEmpty else { return }
        do {
            let response = try await api.markAllNotificationsRead(
                baseURL: config.baseURL,
                accessToken: session.accessToken
            )
            unreadCount = response.unreadCount
            items = items.map { item in
                CommunityNotificationItem(
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    body: item.body,
                    postId: item.postId,
                    commentId: item.commentId,
                    examSlug: item.examSlug,
                    boardSlug: item.boardSlug,
                    actorName: item.actorName,
                    isRead: true,
                    createdAt: item.createdAt,
                    timeLabel: item.timeLabel
                )
            }
        } catch {
            if isCancellation(error) { return }
            message = error.localizedDescription
        }
    }

    private func isCancellation(_ error: Error) -> Bool {
        APIClient.isCancellationError(error)
    }
}
