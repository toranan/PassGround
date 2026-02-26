import Foundation

@MainActor
final class CommunityStore: ObservableObject {
    static let freshWindow: TimeInterval = 25
    static let boardsFreshWindow: TimeInterval = 90
    static let homeFreshWindow: TimeInterval = 60
    static let rankingFreshWindow: TimeInterval = 45
    static let detailFreshWindow: TimeInterval = 90
    static let scheduleFreshWindow: TimeInterval = 180

    struct PostsSnapshot: Codable {
        let posts: [PostSummary]
        let nextCursor: String?
        let hasMore: Bool
        let updatedAt: Date
    }

    struct BoardsSnapshot: Codable {
        let boards: [BoardInfo]
        let writable: Bool
        let updatedAt: Date
    }

    struct HomeSnapshot: Codable {
        let realtimePosts: [HomeFeedPost]
        let latestPosts: [HomeFeedPost]
        let updatedAt: Date
    }

    struct RankingSnapshot: Codable {
        let rankings: [RankingItem]
        let cutoffs: [CutoffItem]
        let updatedAt: Date
    }

    struct PostDetailSnapshot: Codable {
        let response: PostDetailResponse
        let updatedAt: Date
    }

    struct ScheduleSnapshot: Codable {
        let schedules: [ExamScheduleItem]
        let updatedAt: Date
    }

    private struct PersistedState: Codable {
        let postSnapshots: [String: PostsSnapshot]
        let boardSnapshots: [String: BoardsSnapshot]
        let homeSnapshots: [String: HomeSnapshot]
        let rankingSnapshots: [String: RankingSnapshot]?
        let detailSnapshots: [String: PostDetailSnapshot]?
        let scheduleSnapshots: [String: ScheduleSnapshot]?
    }

    private enum Keys {
        static let persistedState = "community_store_state_v1"
    }

    private var postSnapshots: [String: PostsSnapshot] = [:]
    private var boardSnapshots: [String: BoardsSnapshot] = [:]
    private var homeSnapshots: [String: HomeSnapshot] = [:]
    private var rankingSnapshots: [String: RankingSnapshot] = [:]
    private var detailSnapshots: [String: PostDetailSnapshot] = [:]
    private var scheduleSnapshots: [String: ScheduleSnapshot] = [:]

    init() {
        restore()
    }

    private func key(exam: ExamSlug, board: String) -> String {
        "\(exam.rawValue)#\(board)"
    }

    func postsSnapshot(exam: ExamSlug, board: String) -> PostsSnapshot? {
        postSnapshots[key(exam: exam, board: board)]
    }

    func boardsSnapshot(exam: ExamSlug) -> BoardsSnapshot? {
        boardSnapshots[exam.rawValue]
    }

    func homeSnapshot(exam: ExamSlug) -> HomeSnapshot? {
        homeSnapshots[exam.rawValue]
    }

    func rankingSnapshot(exam: ExamSlug) -> RankingSnapshot? {
        rankingSnapshots[exam.rawValue]
    }

    func scheduleSnapshot(exam: ExamSlug) -> ScheduleSnapshot? {
        scheduleSnapshots[exam.rawValue]
    }

    func postDetailSnapshot(postId: String) -> PostDetailSnapshot? {
        detailSnapshots[postId]
    }

    func hasFreshPostDetailSnapshot(postId: String) -> Bool {
        guard let snapshot = detailSnapshots[postId] else { return false }
        return Date().timeIntervalSince(snapshot.updatedAt) <= Self.detailFreshWindow
    }

    func savePostsSnapshot(
        exam: ExamSlug,
        board: String,
        posts: [PostSummary],
        nextCursor: String?,
        hasMore: Bool
    ) {
        postSnapshots[key(exam: exam, board: board)] = PostsSnapshot(
            posts: posts,
            nextCursor: nextCursor,
            hasMore: hasMore,
            updatedAt: Date()
        )
        persist()
    }

    func saveBoardsSnapshot(
        exam: ExamSlug,
        boards: [BoardInfo],
        writable: Bool
    ) {
        boardSnapshots[exam.rawValue] = BoardsSnapshot(
            boards: boards,
            writable: writable,
            updatedAt: Date()
        )
        persist()
    }

    func saveHomeSnapshot(
        exam: ExamSlug,
        realtimePosts: [HomeFeedPost],
        latestPosts: [HomeFeedPost]
    ) {
        homeSnapshots[exam.rawValue] = HomeSnapshot(
            realtimePosts: realtimePosts,
            latestPosts: latestPosts,
            updatedAt: Date()
        )
        persist()
    }

    func saveRankingSnapshot(
        exam: ExamSlug,
        rankings: [RankingItem],
        cutoffs: [CutoffItem]
    ) {
        rankingSnapshots[exam.rawValue] = RankingSnapshot(
            rankings: rankings,
            cutoffs: cutoffs,
            updatedAt: Date()
        )
        persist()
    }

    func savePostDetailSnapshot(postId: String, response: PostDetailResponse) {
        guard !postId.isEmpty else { return }
        detailSnapshots[postId] = PostDetailSnapshot(response: response, updatedAt: Date())
        persist()
    }

    func saveScheduleSnapshot(exam: ExamSlug, schedules: [ExamScheduleItem]) {
        scheduleSnapshots[exam.rawValue] = ScheduleSnapshot(schedules: schedules, updatedAt: Date())
        persist()
    }

    func updateLikeCount(postId: String, likeCount: Int) {
        guard !postId.isEmpty else { return }

        let safeLikeCount = max(0, likeCount)
        var changed = false

        for (snapshotKey, snapshot) in postSnapshots {
            var didChangeSnapshot = false
            let updatedPosts = snapshot.posts.map { post -> PostSummary in
                guard post.id == postId else { return post }
                didChangeSnapshot = true
                return update(post: post, likeCount: safeLikeCount, commentDelta: 0)
            }
            if didChangeSnapshot {
                postSnapshots[snapshotKey] = PostsSnapshot(
                    posts: updatedPosts,
                    nextCursor: snapshot.nextCursor,
                    hasMore: snapshot.hasMore,
                    updatedAt: Date()
                )
                changed = true
            }
        }

        for (snapshotKey, snapshot) in homeSnapshots {
            let didChangeSnapshot =
                snapshot.realtimePosts.contains(where: { $0.post.id == postId }) ||
                snapshot.latestPosts.contains(where: { $0.post.id == postId })
            if !didChangeSnapshot { continue }
            let updatedRealtime = snapshot.realtimePosts.map { update(item: $0, postId: postId, likeCount: safeLikeCount, commentDelta: 0) }
            let updatedLatest = snapshot.latestPosts.map { update(item: $0, postId: postId, likeCount: safeLikeCount, commentDelta: 0) }
            homeSnapshots[snapshotKey] = HomeSnapshot(
                realtimePosts: updatedRealtime,
                latestPosts: updatedLatest,
                updatedAt: Date()
            )
            changed = true
        }

        if let snapshot = detailSnapshots[postId] {
            let response = snapshot.response
            let updatedResponse = PostDetailResponse(
                ok: response.ok,
                writable: response.writable,
                isSamplePost: response.isSamplePost,
                viewerLiked: response.viewerLiked,
                board: response.board,
                post: PostDetail(
                    id: response.post.id,
                    title: response.post.title,
                    content: response.post.content,
                    authorName: response.post.authorName,
                    createdAt: response.post.createdAt,
                    timeLabel: response.post.timeLabel,
                    viewCount: response.post.viewCount,
                    likeCount: safeLikeCount
                ),
                adoptedCommentId: response.adoptedCommentId,
                comments: response.comments
            )
            detailSnapshots[postId] = PostDetailSnapshot(response: updatedResponse, updatedAt: Date())
            changed = true
        }

        if changed {
            persist()
        }
    }

    func incrementCommentCount(postId: String, delta: Int = 1) {
        guard !postId.isEmpty else { return }
        guard delta != 0 else { return }

        var changed = false

        for (snapshotKey, snapshot) in postSnapshots {
            var didChangeSnapshot = false
            let updatedPosts = snapshot.posts.map { post -> PostSummary in
                guard post.id == postId else { return post }
                didChangeSnapshot = true
                return update(post: post, likeCount: nil, commentDelta: delta)
            }
            if didChangeSnapshot {
                postSnapshots[snapshotKey] = PostsSnapshot(
                    posts: updatedPosts,
                    nextCursor: snapshot.nextCursor,
                    hasMore: snapshot.hasMore,
                    updatedAt: Date()
                )
                changed = true
            }
        }

        for (snapshotKey, snapshot) in homeSnapshots {
            let didChangeSnapshot =
                snapshot.realtimePosts.contains(where: { $0.post.id == postId }) ||
                snapshot.latestPosts.contains(where: { $0.post.id == postId })
            if !didChangeSnapshot { continue }
            let updatedRealtime = snapshot.realtimePosts.map { update(item: $0, postId: postId, likeCount: nil, commentDelta: delta) }
            let updatedLatest = snapshot.latestPosts.map { update(item: $0, postId: postId, likeCount: nil, commentDelta: delta) }
            homeSnapshots[snapshotKey] = HomeSnapshot(
                realtimePosts: updatedRealtime,
                latestPosts: updatedLatest,
                updatedAt: Date()
            )
            changed = true
        }

        if changed {
            persist()
        }
    }

    private func update(post: PostSummary, likeCount: Int?, commentDelta: Int) -> PostSummary {
        let resolvedLikeCount = likeCount ?? post.likeCount
        let resolvedCommentCount = max(0, post.commentCount + commentDelta)

        return PostSummary(
            id: post.id,
            title: post.title,
            content: post.content,
            authorName: post.authorName,
            commentCount: resolvedCommentCount,
            likeCount: resolvedLikeCount,
            viewCount: post.viewCount,
            timeLabel: post.timeLabel,
            createdAt: post.createdAt,
            isSample: post.isSample
        )
    }

    private func update(item: HomeFeedPost, postId: String, likeCount: Int?, commentDelta: Int) -> HomeFeedPost {
        guard item.post.id == postId else { return item }
        return HomeFeedPost(
            id: item.id,
            boardSlug: item.boardSlug,
            boardName: item.boardName,
            post: update(post: item.post, likeCount: likeCount, commentDelta: commentDelta)
        )
    }

    private func restore() {
        guard let data = UserDefaults.standard.data(forKey: Keys.persistedState) else {
            return
        }

        guard let state = try? JSONDecoder().decode(PersistedState.self, from: data) else {
            return
        }

        postSnapshots = state.postSnapshots
        boardSnapshots = state.boardSnapshots
        homeSnapshots = state.homeSnapshots
        rankingSnapshots = state.rankingSnapshots ?? [:]
        detailSnapshots = state.detailSnapshots ?? [:]
        scheduleSnapshots = state.scheduleSnapshots ?? [:]
    }

    private func persist() {
        let state = PersistedState(
            postSnapshots: postSnapshots,
            boardSnapshots: boardSnapshots,
            homeSnapshots: homeSnapshots,
            rankingSnapshots: rankingSnapshots,
            detailSnapshots: detailSnapshots,
            scheduleSnapshots: scheduleSnapshots
        )
        guard let data = try? JSONEncoder().encode(state) else { return }
        UserDefaults.standard.set(data, forKey: Keys.persistedState)
    }
}
