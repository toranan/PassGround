import SwiftUI

private let homePrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

struct TransferHomeView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var communityStore: CommunityStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    @State private var exam: ExamSlug = .transfer
    @State private var realtimePosts: [HomeFeedPost] = []
    @State private var latestPosts: [HomeFeedPost] = []

    @State private var loading = false
    @State private var errorMessage = ""
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // 상단 배너 영역 (블라인드 느낌의 프로모션 배너)
                bannerSection
                    .padding(.bottom, 8)

                if loading {
                    ProgressView("피드 불러오는 중...")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(30)
                }

                if !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }

                // 피드 목록
                postsSection(title: "🔥 실시간 인기글", items: realtimePosts, emptyText: "실시간 인기글이 없습니다.")

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
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            let fresh = applyCachedSnapshotIfAvailable()
            if !fresh {
                await load()
            }
        }
        .onAppear {
            refreshIfStale()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                refreshIfStale()
            }
        }
        .refreshable {
            await load(forceRefresh: true)
        }
    }

    private var bannerSection: some View {
        // 프리미엄/광고 배너 예시
        ZStack(alignment: .leading) {
            Color.black

            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text("2026 편입 합격의 기준이 되다")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("합격판 프리미엄 모의지원 출시")
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

    private func postsSection(title: String, items: [HomeFeedPost], emptyText: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.headline.weight(.bold))
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 12)

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
                        PostDetailView(exam: exam, boardSlug: item.boardSlug, postId: item.post.id)
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

                    if index < rows.count - 1 {
                        Divider()
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    private func load(forceRefresh: Bool = false) async {
        if loading { return }
        loading = true
        errorMessage = ""
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy

        do {
            do {
                let response = try await api.fetchHomeFeed(
                    baseURL: config.baseURL,
                    exam: exam,
                    cachePolicy: cachePolicy
                )
                realtimePosts = response.realtimePosts
                latestPosts = response.latestPosts
            } catch {
                guard shouldFallbackToLegacyHomeAPI(error) else { throw error }
                let legacy = try await loadLegacyHomeFeed(cachePolicy: cachePolicy)
                realtimePosts = legacy.realtimePosts
                latestPosts = legacy.latestPosts
            }

            communityStore.saveHomeSnapshot(
                exam: exam,
                realtimePosts: realtimePosts,
                latestPosts: latestPosts
            )
        } catch {
            if isCancellation(error) {
                loading = false
                return
            }
            errorMessage = Self.readableErrorMessage(error, baseURL: config.baseURL)
        }

        loading = false
    }

    private func loadLegacyHomeFeed(
        cachePolicy: URLRequest.CachePolicy
    ) async throws -> (realtimePosts: [HomeFeedPost], latestPosts: [HomeFeedPost]) {
        let boardsResponse = try await api.fetchBoards(
            baseURL: config.baseURL,
            exam: exam,
            cachePolicy: cachePolicy
        )
        var boards = boardsResponse.boards.isEmpty ? fallbackBoards(for: exam) : Array(boardsResponse.boards.prefix(8))
        boards = boards.filter { $0.slug != "free" }

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
        return (realtimePosts: realtime, latestPosts: latest)
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.homeSnapshot(exam: exam) else {
            return false
        }
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
        Task { await load() }
    }

    private func fallbackBoards(for exam: ExamSlug) -> [BoardInfo] {
        _ = exam
        return [
            BoardInfo(id: "transfer-qa", slug: "qa", name: "학습법공유", description: "대학/전형/학습 전략 질문과 답변", preview: []),
            BoardInfo(id: "transfer-study-qa", slug: "study-qa", name: "학습질문", description: "영어/수학/논술 과목별 공부법 질문과 답변", preview: []),
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
