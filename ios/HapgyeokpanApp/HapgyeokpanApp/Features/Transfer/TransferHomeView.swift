import SwiftUI

private let homePrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

private struct HomeBannerDdayInfo {
    let targetLabel: String
    let ddayLabel: String
    let subtitle: String

    static let `default` = HomeBannerDdayInfo(
        targetLabel: "목표대학 미설정",
        ddayLabel: "D-day",
        subtitle: "마이에서 목표대학을 설정하면 대학별 일정 기준 D-day를 보여줘"
    )
}

struct TransferHomeView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var communityStore: CommunityStore
    @EnvironmentObject private var session: SessionStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var latestNewsPosts: [HomeFeedPost] = []
    @State private var realtimePosts: [HomeFeedPost] = []
    @State private var latestPosts: [HomeFeedPost] = []

    @State private var loading = false
    @State private var errorMessage = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast
    @State private var prefetchedPostIDs: Set<String> = []
    @State private var unreadCount = 0
    @State private var loadRevision = 0
    @State private var bannerDdayInfo = HomeBannerDdayInfo.default


    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // 상단 배너 영역 (블라인드 느낌의 프로모션 배너)
                bannerSection
                    .padding(.bottom, 8)

                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }

                // 피드 목록
                postsSection(
                    title: "📰 최신뉴스",
                    items: latestNewsPosts,
                    emptyText: "최신뉴스가 없습니다.",
                    destinationTitle: "최신뉴스"
                )

                Divider().background(Color(.systemGray5)).frame(height: 8)

                postsSection(
                    title: "🔥 실시간 인기글",
                    items: realtimePosts,
                    emptyText: "실시간 인기글이 없습니다.",
                    destinationTitle: "실시간 인기글"
                )

                Divider().background(Color(.systemGray5)).frame(height: 8)

                postsSection(title: "🕒 최신글", items: latestPosts, emptyText: "최신글이 없습니다.")
            }
            .padding(.bottom, 20)
        }
        .background(Color.white) // 전체 배경을 흰색으로 변경 (블라인드 스타일)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("합격판")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(destination: NotificationInboxView()) {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell")
                            .font(.system(size: 20))
                            .foregroundStyle(.primary)
                        
                        if unreadCount > 0 {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                                .offset(x: 2, y: -2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            let fresh = applyCachedSnapshotIfAvailable()
            bannerDdayInfo = await loadBannerDdayInfo(
                allowNetworkFetch: true,
                cachePolicy: .useProtocolCachePolicy,
                cacheBust: nil
            )
            if !fresh {
                await load(forceRefresh: true)
            }
        }
        .onAppear {
            Task {
                bannerDdayInfo = await loadBannerDdayInfo(
                    allowNetworkFetch: false,
                    cachePolicy: .useProtocolCachePolicy,
                    cacheBust: nil
                )
            }
            refreshIfStale()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                Task {
                    bannerDdayInfo = await loadBannerDdayInfo(
                        allowNetworkFetch: false,
                        cachePolicy: .useProtocolCachePolicy,
                        cacheBust: nil
                    )
                }
                refreshIfStale()
            }
        }
        .refreshable {
            await load(forceRefresh: true)
        }
    }

    private var bannerSection: some View {
        ZStack(alignment: .leading) {
            Color.black

            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(bannerDdayInfo.targetLabel)
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(bannerDdayInfo.ddayLabel)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                    Text(bannerDdayInfo.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.gray)
                }
                Spacer()
                Image(systemName: "graduationcap.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 40, height: 40)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
    }

    private func postsSection(
        title: String,
        items: [HomeFeedPost],
        emptyText: String,
        destinationTitle: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let destinationTitle {
                NavigationLink {
                    HomeFeedListView(
                        title: destinationTitle,
                        exam: exam,
                        items: items
                    )
                } label: {
                    HStack(spacing: 6) {
                        Text(title)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.primary)
                        Spacer()
                        Text("전체보기")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
                    .padding(.bottom, 12)
                }
                .buttonStyle(.plain)
            } else {
                Text(title)
                    .font(.headline.weight(.bold))
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
                    .padding(.bottom, 12)
            }

            if items.isEmpty {
                Text(emptyText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            } else {
                let rows = Array(items.prefix(3))
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                    NavigationLink {
                        PostDetailView(
                            exam: exam,
                            boardSlug: item.boardSlug,
                            postId: item.post.id,
                            initialPost: item.post,
                            boardName: item.boardName
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.post.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)

                            HStack(spacing: 8) {
                                Text(item.boardName)
                                Text(item.post.timeLabel)
                                Label("\(item.post.commentCount)", systemImage: "text.bubble")
                                Label("\(item.post.likeCount)", systemImage: "hand.thumbsup")
                                Label("\(item.post.viewCount)", systemImage: "eye")
                            }
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.white)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        Task { await prefetchPostDetail(item) }
                    }

                    if index < rows.count - 1 {
                        Divider()
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    private func load(forceRefresh: Bool = false) async {
        if loading && !forceRefresh { return }
        loading = true
        errorMessage = ""
        loadRevision += 1
        let requestRevision = loadRevision
        defer {
            if requestRevision == loadRevision {
                loading = false
            }
        }
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        let cacheBust = forceRefresh ? String(Int(Date().timeIntervalSince1970 * 1000)) : nil

        do {
            let resolvedLatestNewsPosts: [HomeFeedPost]
            let resolvedRealtimePosts: [HomeFeedPost]
            let resolvedLatestPosts: [HomeFeedPost]
            let resolvedBannerInfo: HomeBannerDdayInfo

            do {
                let response = try await api.fetchHomeFeed(
                    baseURL: config.baseURL,
                    exam: exam,
                    cacheBust: cacheBust,
                    cachePolicy: cachePolicy
                )
                resolvedLatestNewsPosts = communityStore.mergeLikeOverrides(feedItems: response.latestNewsPosts)
                resolvedRealtimePosts = communityStore.mergeLikeOverrides(feedItems: response.realtimePosts)
                resolvedLatestPosts = communityStore.mergeLikeOverrides(feedItems: response.latestPosts)
                resolvedBannerInfo = await loadBannerDdayInfo(
                    allowNetworkFetch: false,
                    cachePolicy: cachePolicy,
                    cacheBust: cacheBust
                )
            } catch {
                guard shouldFallbackToLegacyHomeAPI(error) else { throw error }
                let legacy = try await loadLegacyHomeFeed(cachePolicy: cachePolicy)
                resolvedLatestNewsPosts = communityStore.mergeLikeOverrides(feedItems: legacy.latestNewsPosts)
                resolvedRealtimePosts = communityStore.mergeLikeOverrides(feedItems: legacy.realtimePosts)
                resolvedLatestPosts = communityStore.mergeLikeOverrides(feedItems: legacy.latestPosts)
                resolvedBannerInfo = await loadBannerDdayInfo(
                    allowNetworkFetch: false,
                    cachePolicy: cachePolicy,
                    cacheBust: cacheBust
                )
            }

            guard requestRevision == loadRevision else { return }
            latestNewsPosts = resolvedLatestNewsPosts
            realtimePosts = resolvedRealtimePosts
            latestPosts = resolvedLatestPosts
            bannerDdayInfo = resolvedBannerInfo
            communityStore.saveHomeSnapshot(
                exam: exam,
                realtimePosts: realtimePosts,
                latestPosts: latestPosts,
                latestNewsPosts: latestNewsPosts
            )
            await refreshUnreadCount()
        } catch {
            if isCancellation(error) {
                return
            }
            guard requestRevision == loadRevision else { return }
            errorMessage = Self.readableErrorMessage(error, baseURL: config.baseURL)
        }
    }

    private func loadBannerDdayInfo(
        allowNetworkFetch: Bool,
        cachePolicy: URLRequest.CachePolicy,
        cacheBust: String?
    ) async -> HomeBannerDdayInfo {
        let schedules = await loadScheduleItemsForBanner(
            allowNetworkFetch: allowNetworkFetch,
            cachePolicy: cachePolicy,
            cacheBust: cacheBust
        )
        let targetUniversity = loadTargetUniversityForBanner()
        return resolveBannerDdayInfo(
            targetUniversity: targetUniversity,
            schedules: schedules
        )
    }

    private func loadScheduleItemsForBanner(
        allowNetworkFetch: Bool,
        cachePolicy: URLRequest.CachePolicy,
        cacheBust: String?
    ) async -> [ExamScheduleItem] {
        if !allowNetworkFetch {
            return communityStore.scheduleSnapshot(exam: exam)?.schedules ?? []
        }
        do {
            let response = try await api.fetchSchedules(
                baseURL: config.baseURL,
                exam: exam,
                cachePolicy: cachePolicy,
                cacheBust: cacheBust
            )
            communityStore.saveScheduleSnapshot(exam: exam, schedules: response.schedules)
            return response.schedules
        } catch {
            if let snapshot = communityStore.scheduleSnapshot(exam: exam) {
                return snapshot.schedules
            }
            return []
        }
    }

    private func loadTargetUniversityForBanner() -> String? {
        session.user?.targetUniversity?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func resolveBannerDdayInfo(
        targetUniversity: String?,
        schedules: [ExamScheduleItem]
    ) -> HomeBannerDdayInfo {
        let trimmedTarget = targetUniversity?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let now = Date()
        let today = Calendar.current.startOfDay(for: now)

        let matchedSchedules = schedules
            .filter { schedule in
                guard !trimmedTarget.isEmpty else { return false }
                return scheduleMatchesTarget(schedule, target: trimmedTarget)
            }
            .sorted { Self.parseDate($0.startsAt) < Self.parseDate($1.startsAt) }

        let nextMatched = matchedSchedules.first(where: { Self.parseDate($0.startsAt) >= now })
        let targetDate = nextMatched.map { Self.parseDate($0.startsAt) } ?? Self.defaultReferenceDate(from: now)

        let diffDays = Calendar.current.dateComponents([.day], from: today, to: Calendar.current.startOfDay(for: targetDate)).day ?? 0
        let ddayLabel: String = {
            if diffDays == 0 { return "D-day" }
            if diffDays > 0 { return "D-\(diffDays)" }
            return "D+\(abs(diffDays))"
        }()

        if let nextMatched {
            let targetLabel = trimmedTarget.isEmpty ? "목표대학 미설정" : "\(trimmedTarget) 기준"
            let subtitle = "\(nextMatched.title) · \(Self.formatDateLabel(nextMatched.startsAt))"
            return HomeBannerDdayInfo(
                targetLabel: targetLabel,
                ddayLabel: ddayLabel,
                subtitle: subtitle
            )
        }

        let defaultDateLabel = Self.formatDateLabel(Self.defaultReferenceDate(from: now))
        if trimmedTarget.isEmpty {
            return HomeBannerDdayInfo(
                targetLabel: "목표대학 미설정",
                ddayLabel: ddayLabel,
                subtitle: "기본 기준일 \(defaultDateLabel) (마이에서 목표대학 설정 가능)"
            )
        }

        return HomeBannerDdayInfo(
            targetLabel: "\(trimmedTarget) 기준",
            ddayLabel: ddayLabel,
            subtitle: "대학별 일정 미등록 · 기본 기준일 \(defaultDateLabel)"
        )
    }

    private func scheduleMatchesTarget(_ schedule: ExamScheduleItem, target: String) -> Bool {
        let normalizedTarget = target.replacingOccurrences(of: " ", with: "")
        if normalizedTarget.isEmpty { return false }

        let fields: [String] = [
            schedule.university ?? "",
            schedule.title,
            schedule.location ?? "",
            schedule.organizer ?? "",
            schedule.note ?? ""
        ]

        return fields.contains { field in
            let normalizedField = field.replacingOccurrences(of: " ", with: "")
            return normalizedField.localizedCaseInsensitiveContains(normalizedTarget)
        }
    }

    private func loadLegacyHomeFeed(
        cachePolicy: URLRequest.CachePolicy
    ) async throws -> (latestNewsPosts: [HomeFeedPost], realtimePosts: [HomeFeedPost], latestPosts: [HomeFeedPost]) {
        let boardsResponse = try await api.fetchBoards(
            baseURL: config.baseURL,
            exam: exam,
            cachePolicy: cachePolicy
        )
        var boards = boardsResponse.boards.isEmpty ? fallbackBoards(for: exam) : Array(boardsResponse.boards.prefix(8))
        boards = boards.filter { $0.slug != "news" }

        let baseURL = config.baseURL
        let examValue = exam
        let merged: [HomeFeedPost] = try await withThrowingTaskGroup(of: [HomeFeedPost].self) { group in
            for board in boards {
                let boardSlug = board.slug
                let boardName = board.name
                group.addTask {
                    let api = APIClient()
                    let postsResponse = try await api.fetchPosts(
                        baseURL: baseURL,
                        exam: examValue,
                        board: boardSlug,
                        limit: 20,
                        cursor: nil,
                        cachePolicy: cachePolicy
                    )
                    return postsResponse.posts.map { post in
                        HomeFeedPost(
                            id: "\(boardSlug)-\(post.id)",
                            boardSlug: boardSlug,
                            boardName: boardName,
                            post: post
                        )
                    }
                }
            }

            var rows: [HomeFeedPost] = []
            for try await partial in group {
                rows.append(contentsOf: partial)
            }
            return rows
        }

        let deduped = Self.deduplicateByPostID(merged)

        let realtime = deduped.sorted {
            if $0.hotScore != $1.hotScore { return $0.hotScore > $1.hotScore }
            return Self.parseDate($0.post.createdAt) > Self.parseDate($1.post.createdAt)
        }
        let latest = deduped.sorted {
            Self.parseDate($0.post.createdAt) > Self.parseDate($1.post.createdAt)
        }

        let latestNewsPosts: [HomeFeedPost]
        do {
            let newsResponse = try await api.fetchPosts(
                baseURL: config.baseURL,
                exam: exam,
                board: "news",
                limit: 20,
                cursor: nil,
                cachePolicy: cachePolicy
            )
            latestNewsPosts = newsResponse.posts.map { post in
                HomeFeedPost(
                    id: "news-\(post.id)",
                    boardSlug: "news",
                    boardName: "최신뉴스",
                    post: post
                )
            }
        } catch {
            latestNewsPosts = []
        }

        return (latestNewsPosts: latestNewsPosts, realtimePosts: realtime, latestPosts: latest)
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.homeSnapshot(exam: exam) else {
            return false
        }
        latestNewsPosts = snapshot.latestNewsPosts
        realtimePosts = snapshot.realtimePosts
        latestPosts = snapshot.latestPosts
        errorMessage = ""
        return Date().timeIntervalSince(snapshot.updatedAt) <= CommunityStore.homeFreshWindow
    }

    private func refreshIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        guard !fresh, !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await load(forceRefresh: true) }
    }

    private func prefetchPostDetail(_ item: HomeFeedPost) async {
        let postId = item.post.id
        guard !postId.isEmpty else { return }
        guard !prefetchedPostIDs.contains(postId) else { return }
        if communityStore.hasFreshPostDetailSnapshot(postId: postId, viewerUserID: session.user?.id) {
            prefetchedPostIDs.insert(postId)
            return
        }

        prefetchedPostIDs.insert(postId)
        do {
            let response = try await api.fetchPostDetail(
                baseURL: config.baseURL,
                exam: exam,
                board: item.boardSlug,
                postId: postId,
                userId: session.user?.id,
                cachePolicy: .useProtocolCachePolicy
            )
            communityStore.savePostDetailSnapshot(
                postId: postId,
                response: response,
                viewerUserID: session.user?.id
            )
        } catch {
            if isCancellation(error) { return }
            prefetchedPostIDs.remove(postId)
        }
    }

    @MainActor
    private func refreshUnreadCount() async {
        guard let userId = session.user?.id else {
            unreadCount = 0
            return
        }
        guard !session.accessToken.isEmpty else {
            unreadCount = 0
            return
        }

        do {
            let response = try await api.fetchNotifications(
                baseURL: config.baseURL,
                userId: userId,
                accessToken: session.accessToken,
                limit: 1
            )
            unreadCount = response.unreadCount
        } catch {
            if APIClient.isCancellationError(error) { return }
        }
    }

    private func fallbackBoards(for exam: ExamSlug) -> [BoardInfo] {
        _ = exam
        return [
            BoardInfo(id: "transfer-qa", slug: "qa", name: "합격전략", description: "대학/전형/학습 전략 질문과 답변", preview: []),
            BoardInfo(id: "transfer-study-qa", slug: "study-qa", name: "학습질문", description: "과목별 공부법과 자유로운학습질문 공간", preview: []),
            BoardInfo(id: "transfer-admit", slug: "admit-review", name: "합격수기", description: "합격생 인증 기반 수기와 노하우", preview: [])
        ]
    }

    private static func deduplicateByPostID(_ items: [HomeFeedPost]) -> [HomeFeedPost] {
        var map: [String: HomeFeedPost] = [:]
        for item in items {
            let current = map[item.post.id]
            if current == nil || parseDate(item.post.createdAt) > parseDate(current?.post.createdAt) {
                map[item.post.id] = item
            }
        }
        return Array(map.values)
    }

    private func shouldFallbackToLegacyHomeAPI(_ error: Error) -> Bool {
        let message = error.localizedDescription.lowercased()
        return message.contains("http 404") || message.contains("api 경로를 찾지 못했습니다")
    }

    nonisolated private static func parseDate(_ value: String?) -> Date {
        guard let value, !value.isEmpty else { return .distantPast }

        let isoWithFraction = ISO8601DateFormatter()
        isoWithFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoWithFraction.date(from: value) { return date }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: value) { return date }

        return .distantPast
    }

    nonisolated private static func defaultReferenceDate(from now: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul") ?? .current

        let currentYear = calendar.component(.year, from: now)
        var components = DateComponents()
        components.year = currentYear
        components.month = 1
        components.day = 10
        components.hour = 9
        components.minute = 0

        let thisYear = calendar.date(from: components) ?? now
        if thisYear >= now {
            return thisYear
        }
        components.year = currentYear + 1
        return calendar.date(from: components) ?? thisYear
    }

    nonisolated private static func formatDateLabel(_ value: String?) -> String {
        let date = parseDate(value)
        return formatDateLabel(date)
    }

    nonisolated private static func formatDateLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "yyyy.MM.dd"
        return formatter.string(from: date)
    }

    private static func readableErrorMessage(_ error: Error, baseURL: URL) -> String {
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

private struct HomeFeedListView: View {
    let title: String
    let exam: ExamSlug
    let items: [HomeFeedPost]

    var body: some View {
        List {
            if items.isEmpty {
                Text("표시할 게시글이 없습니다.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in
                    NavigationLink {
                        PostDetailView(
                            exam: exam,
                            boardSlug: item.boardSlug,
                            postId: item.post.id,
                            initialPost: item.post,
                            boardName: item.boardName
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.post.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(2)

                            HStack(spacing: 8) {
                                Text(item.boardName)
                                Text(item.post.timeLabel)
                                Label("\(item.post.commentCount)", systemImage: "text.bubble")
                                Label("\(item.post.likeCount)", systemImage: "hand.thumbsup")
                                Label("\(item.post.viewCount)", systemImage: "eye")
                            }
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
