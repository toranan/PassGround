import Foundation

@MainActor
final class CommunityStore: ObservableObject {
    static let freshWindow: TimeInterval = 25
    static let boardsFreshWindow: TimeInterval = 90
    static let homeFreshWindow: TimeInterval = 60
    static let rankingFreshWindow: TimeInterval = 45
    static let detailFreshWindow: TimeInterval = 90
    static let scheduleFreshWindow: TimeInterval = 180
    static let optimisticLikeWindow: TimeInterval = 600
    static let likeSyncRetentionWindow: TimeInterval = 60 * 60 * 24 * 7

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
        let latestNewsPosts: [HomeFeedPost]
        let updatedAt: Date

        enum CodingKeys: String, CodingKey {
            case realtimePosts
            case latestPosts
            case latestNewsPosts
            case updatedAt
        }

        init(
            realtimePosts: [HomeFeedPost],
            latestPosts: [HomeFeedPost],
            latestNewsPosts: [HomeFeedPost],
            updatedAt: Date
        ) {
            self.realtimePosts = realtimePosts
            self.latestPosts = latestPosts
            self.latestNewsPosts = latestNewsPosts
            self.updatedAt = updatedAt
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            realtimePosts = try container.decode([HomeFeedPost].self, forKey: .realtimePosts)
            latestPosts = try container.decode([HomeFeedPost].self, forKey: .latestPosts)
            latestNewsPosts = try container.decodeIfPresent([HomeFeedPost].self, forKey: .latestNewsPosts) ?? []
            updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        }
    }

    struct RankingSnapshot: Codable {
        let rankings: [RankingItem]
        let cutoffs: [CutoffItem]
        let updatedAt: Date
    }

    struct PostDetailSnapshot: Codable {
        let response: PostDetailResponse
        let updatedAt: Date
        let viewerUserID: String?
    }

    struct ScheduleSnapshot: Codable {
        let schedules: [ExamScheduleItem]
        let updatedAt: Date
    }

    struct LikeOverride: Codable {
        let likeCount: Int
        let viewerLiked: Bool?
        let viewerUserID: String?
        let updatedAt: Date
    }

    struct PendingLikeSync: Codable {
        let postId: String
        let desiredLiked: Bool
        let viewerUserID: String
        let revision: Int
        let attemptCount: Int
        let nextRetryAt: Date
        let updatedAt: Date
    }

    private struct PersistedState: Codable {
        let postSnapshots: [String: PostsSnapshot]
        let boardSnapshots: [String: BoardsSnapshot]
        let homeSnapshots: [String: HomeSnapshot]
        let rankingSnapshots: [String: RankingSnapshot]?
        let detailSnapshots: [String: PostDetailSnapshot]?
        let scheduleSnapshots: [String: ScheduleSnapshot]?
        let likeOverrides: [String: LikeOverride]?
        let pendingLikeSyncs: [String: PendingLikeSync]?
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
    private var likeOverrides: [String: LikeOverride] = [:]
    private var pendingLikeSyncs: [String: PendingLikeSync] = [:]

    init() {
        restore()
    }

    private func key(exam: ExamSlug, board: String) -> String {
        "\(exam.rawValue)#\(board)"
    }

    private func likeSyncKey(postId: String, viewerUserID: String) -> String {
        "\(viewerUserID)#\(postId)"
    }

    func postsSnapshot(exam: ExamSlug, board: String) -> PostsSnapshot? {
        pruneExpiredLikeOverridesIfNeeded()
        guard let snapshot = postSnapshots[key(exam: exam, board: board)] else { return nil }
        return PostsSnapshot(
            posts: mergeLikeOverrides(posts: snapshot.posts),
            nextCursor: snapshot.nextCursor,
            hasMore: snapshot.hasMore,
            updatedAt: snapshot.updatedAt
        )
    }

    func boardsSnapshot(exam: ExamSlug) -> BoardsSnapshot? {
        boardSnapshots[exam.rawValue]
    }

    func homeSnapshot(exam: ExamSlug) -> HomeSnapshot? {
        pruneExpiredLikeOverridesIfNeeded()
        guard let snapshot = homeSnapshots[exam.rawValue] else { return nil }
        return HomeSnapshot(
            realtimePosts: mergeLikeOverrides(feedItems: snapshot.realtimePosts),
            latestPosts: mergeLikeOverrides(feedItems: snapshot.latestPosts),
            latestNewsPosts: mergeLikeOverrides(feedItems: snapshot.latestNewsPosts),
            updatedAt: snapshot.updatedAt
        )
    }

    func rankingSnapshot(exam: ExamSlug) -> RankingSnapshot? {
        rankingSnapshots[exam.rawValue]
    }

    func scheduleSnapshot(exam: ExamSlug) -> ScheduleSnapshot? {
        scheduleSnapshots[exam.rawValue]
    }

    func postDetailSnapshot(postId: String, viewerUserID: String?) -> PostDetailSnapshot? {
        pruneExpiredLikeOverridesIfNeeded()
        guard let snapshot = detailSnapshots[postId] else { return nil }
        if let viewerUserID {
            guard snapshot.viewerUserID == nil || snapshot.viewerUserID == viewerUserID else { return nil }
        }
        return PostDetailSnapshot(
            response: mergeLikeOverrides(response: snapshot.response, viewerUserID: viewerUserID),
            updatedAt: snapshot.updatedAt,
            viewerUserID: snapshot.viewerUserID
        )
    }

    func hasFreshPostDetailSnapshot(postId: String, viewerUserID: String?) -> Bool {
        guard let snapshot = postDetailSnapshot(postId: postId, viewerUserID: viewerUserID) else { return false }
        return Date().timeIntervalSince(snapshot.updatedAt) <= Self.detailFreshWindow
    }

    func savePostsSnapshot(
        exam: ExamSlug,
        board: String,
        posts: [PostSummary],
        nextCursor: String?,
        hasMore: Bool
    ) {
        pruneExpiredLikeOverridesIfNeeded()
        let resolvedPosts = mergeLikeOverrides(posts: posts)
        postSnapshots[key(exam: exam, board: board)] = PostsSnapshot(
            posts: resolvedPosts,
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
        latestPosts: [HomeFeedPost],
        latestNewsPosts: [HomeFeedPost]
    ) {
        pruneExpiredLikeOverridesIfNeeded()
        homeSnapshots[exam.rawValue] = HomeSnapshot(
            realtimePosts: mergeLikeOverrides(feedItems: realtimePosts),
            latestPosts: mergeLikeOverrides(feedItems: latestPosts),
            latestNewsPosts: mergeLikeOverrides(feedItems: latestNewsPosts),
            updatedAt: Date()
        )
        persist()
    }

    func invalidateHomeSnapshot(exam: ExamSlug? = nil) {
        let didChange: Bool
        if let exam {
            didChange = homeSnapshots.removeValue(forKey: exam.rawValue) != nil
        } else {
            didChange = !homeSnapshots.isEmpty
            homeSnapshots.removeAll()
        }
        if didChange {
            persist()
        }
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

    func savePostDetailSnapshot(postId: String, response: PostDetailResponse, viewerUserID: String?) {
        guard !postId.isEmpty else { return }
        pruneExpiredLikeOverridesIfNeeded()
        detailSnapshots[postId] = PostDetailSnapshot(
            response: mergeLikeOverrides(response: response, viewerUserID: viewerUserID),
            updatedAt: Date(),
            viewerUserID: viewerUserID
        )
        persist()
    }

    func saveScheduleSnapshot(exam: ExamSlug, schedules: [ExamScheduleItem]) {
        scheduleSnapshots[exam.rawValue] = ScheduleSnapshot(schedules: schedules, updatedAt: Date())
        persist()
    }

    func updateLikeCount(postId: String, likeCount: Int, viewerLiked: Bool? = nil, viewerUserID: String? = nil) {
        guard !postId.isEmpty else { return }

        pruneExpiredLikeOverridesIfNeeded()
        let safeLikeCount = max(0, likeCount)
        let previousOverride = likeOverrides[postId]
        likeOverrides[postId] = LikeOverride(
            likeCount: safeLikeCount,
            viewerLiked: viewerLiked ?? previousOverride?.viewerLiked,
            viewerUserID: viewerUserID ?? previousOverride?.viewerUserID,
            updatedAt: Date()
        )
        var changed = true

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
                snapshot.latestPosts.contains(where: { $0.post.id == postId }) ||
                snapshot.latestNewsPosts.contains(where: { $0.post.id == postId })
            if !didChangeSnapshot { continue }
            let updatedRealtime = snapshot.realtimePosts.map { update(item: $0, postId: postId, likeCount: safeLikeCount, commentDelta: 0) }
            let updatedLatest = snapshot.latestPosts.map { update(item: $0, postId: postId, likeCount: safeLikeCount, commentDelta: 0) }
            let updatedLatestNews = snapshot.latestNewsPosts.map { update(item: $0, postId: postId, likeCount: safeLikeCount, commentDelta: 0) }
            homeSnapshots[snapshotKey] = HomeSnapshot(
                realtimePosts: updatedRealtime,
                latestPosts: updatedLatest,
                latestNewsPosts: updatedLatestNews,
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
                viewerLiked: viewerLiked ?? response.viewerLiked,
                viewerCanDelete: response.viewerCanDelete,
                board: response.board,
                post: PostDetail(
                    id: response.post.id,
                    title: response.post.title,
                    content: response.post.content,
                    authorName: response.post.authorName,
                    authorId: response.post.authorId,
                    createdAt: response.post.createdAt,
                    timeLabel: response.post.timeLabel,
                    viewCount: response.post.viewCount,
                    likeCount: safeLikeCount
                ),
                adoptedCommentId: response.adoptedCommentId,
                comments: response.comments
            )
            detailSnapshots[postId] = PostDetailSnapshot(
                response: updatedResponse,
                updatedAt: Date(),
                viewerUserID: viewerUserID ?? snapshot.viewerUserID
            )
            changed = true
        }

        if changed {
            persist()
        }
    }

    func enqueueLikeSync(postId: String, desiredLiked: Bool, viewerUserID: String) {
        guard !postId.isEmpty, !viewerUserID.isEmpty else { return }
        pruneExpiredLikeSyncsIfNeeded()

        let key = likeSyncKey(postId: postId, viewerUserID: viewerUserID)
        let previous = pendingLikeSyncs[key]
        let nextRevision = (previous?.revision ?? 0) + 1
        let now = Date()
        pendingLikeSyncs[key] = PendingLikeSync(
            postId: postId,
            desiredLiked: desiredLiked,
            viewerUserID: viewerUserID,
            revision: nextRevision,
            attemptCount: 0,
            nextRetryAt: now,
            updatedAt: now
        )
        persist()
    }

    func nextReadyLikeSync(viewerUserID: String, now: Date = Date()) -> PendingLikeSync? {
        guard !viewerUserID.isEmpty else { return nil }
        pruneExpiredLikeSyncsIfNeeded()
        return pendingLikeSyncs.values
            .filter { item in
                item.viewerUserID == viewerUserID && item.nextRetryAt <= now
            }
            .sorted { lhs, rhs in
                if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt < rhs.updatedAt }
                return lhs.revision < rhs.revision
            }
            .first
    }

    @discardableResult
    func completeLikeSync(
        postId: String,
        viewerUserID: String,
        ackRevision: Int,
        serverLiked: Bool,
        serverLikeCount: Int?
    ) -> Bool {
        let key = likeSyncKey(postId: postId, viewerUserID: viewerUserID)
        guard let current = pendingLikeSyncs[key] else { return false }
        guard current.revision == ackRevision else { return false }

        pendingLikeSyncs.removeValue(forKey: key)

        if let resolvedLikeCount = resolvedLikeCountForAck(postId: postId, serverLikeCount: serverLikeCount) {
            updateLikeCount(
                postId: postId,
                likeCount: resolvedLikeCount,
                viewerLiked: serverLiked,
                viewerUserID: viewerUserID
            )
        } else {
            persist()
        }
        return true
    }

    func markLikeSyncFailure(postId: String, viewerUserID: String, ackRevision: Int) {
        let key = likeSyncKey(postId: postId, viewerUserID: viewerUserID)
        guard let current = pendingLikeSyncs[key] else { return }
        guard current.revision == ackRevision else { return }

        let nextAttempt = current.attemptCount + 1
        let exponent = Double(min(6, nextAttempt))
        let baseDelay = min(60.0, pow(2.0, exponent))
        let jitter = Double.random(in: 0...0.35)
        let delay = baseDelay + jitter
        pendingLikeSyncs[key] = PendingLikeSync(
            postId: current.postId,
            desiredLiked: current.desiredLiked,
            viewerUserID: current.viewerUserID,
            revision: current.revision,
            attemptCount: nextAttempt,
            nextRetryAt: Date().addingTimeInterval(delay),
            updatedAt: current.updatedAt
        )
        persist()
    }

    func mergeLikeOverrides(posts: [PostSummary]) -> [PostSummary] {
        pruneExpiredLikeOverridesIfNeeded()
        return posts.map { applyLikeOverride(to: $0) }
    }

    func mergeLikeOverrides(feedItems: [HomeFeedPost]) -> [HomeFeedPost] {
        pruneExpiredLikeOverridesIfNeeded()
        return feedItems.map { item in
            HomeFeedPost(
                id: item.id,
                boardSlug: item.boardSlug,
                boardName: item.boardName,
                post: applyLikeOverride(to: item.post)
            )
        }
    }

    func mergeLikeOverrides(response: PostDetailResponse, viewerUserID: String?) -> PostDetailResponse {
        pruneExpiredLikeOverridesIfNeeded()
        guard let override = currentLikeOverride(postId: response.post.id) else {
            return response
        }

        let resolvedViewerLiked: Bool?
        if let overrideLiked = override.viewerLiked,
           override.viewerUserID == nil || override.viewerUserID == viewerUserID {
            resolvedViewerLiked = overrideLiked
        } else {
            resolvedViewerLiked = response.viewerLiked
        }

        return PostDetailResponse(
            ok: response.ok,
            writable: response.writable,
            isSamplePost: response.isSamplePost,
            viewerLiked: resolvedViewerLiked,
            viewerCanDelete: response.viewerCanDelete,
            board: response.board,
            post: PostDetail(
                id: response.post.id,
                title: response.post.title,
                content: response.post.content,
                authorName: response.post.authorName,
                authorId: response.post.authorId,
                createdAt: response.post.createdAt,
                timeLabel: response.post.timeLabel,
                viewCount: response.post.viewCount,
                likeCount: override.likeCount
            ),
            adoptedCommentId: response.adoptedCommentId,
            comments: response.comments
        )
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
                snapshot.latestPosts.contains(where: { $0.post.id == postId }) ||
                snapshot.latestNewsPosts.contains(where: { $0.post.id == postId })
            if !didChangeSnapshot { continue }
            let updatedRealtime = snapshot.realtimePosts.map { update(item: $0, postId: postId, likeCount: nil, commentDelta: delta) }
            let updatedLatest = snapshot.latestPosts.map { update(item: $0, postId: postId, likeCount: nil, commentDelta: delta) }
            let updatedLatestNews = snapshot.latestNewsPosts.map { update(item: $0, postId: postId, likeCount: nil, commentDelta: delta) }
            homeSnapshots[snapshotKey] = HomeSnapshot(
                realtimePosts: updatedRealtime,
                latestPosts: updatedLatest,
                latestNewsPosts: updatedLatestNews,
                updatedAt: Date()
            )
            changed = true
        }

        if changed {
            persist()
        }
    }

    func removePost(postId: String) {
        guard !postId.isEmpty else { return }
        var changed = false

        for (snapshotKey, snapshot) in postSnapshots {
            let filtered = snapshot.posts.filter { $0.id != postId }
            guard filtered.count != snapshot.posts.count else { continue }
            postSnapshots[snapshotKey] = PostsSnapshot(
                posts: filtered,
                nextCursor: snapshot.nextCursor,
                hasMore: snapshot.hasMore,
                updatedAt: Date()
            )
            changed = true
        }

        for (snapshotKey, snapshot) in homeSnapshots {
            let updatedRealtime = snapshot.realtimePosts.filter { $0.post.id != postId }
            let updatedLatest = snapshot.latestPosts.filter { $0.post.id != postId }
            let updatedLatestNews = snapshot.latestNewsPosts.filter { $0.post.id != postId }
            let hasDiff =
                updatedRealtime.count != snapshot.realtimePosts.count ||
                updatedLatest.count != snapshot.latestPosts.count ||
                updatedLatestNews.count != snapshot.latestNewsPosts.count
            guard hasDiff else { continue }
            homeSnapshots[snapshotKey] = HomeSnapshot(
                realtimePosts: updatedRealtime,
                latestPosts: updatedLatest,
                latestNewsPosts: updatedLatestNews,
                updatedAt: Date()
            )
            changed = true
        }

        if detailSnapshots.removeValue(forKey: postId) != nil { changed = true }
        if likeOverrides.removeValue(forKey: postId) != nil { changed = true }

        let pendingCount = pendingLikeSyncs.count
        pendingLikeSyncs = pendingLikeSyncs.filter { _, item in
            item.postId != postId
        }
        if pendingLikeSyncs.count != pendingCount { changed = true }

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

    private func applyLikeOverride(to post: PostSummary) -> PostSummary {
        guard let override = currentLikeOverride(postId: post.id) else { return post }
        return update(post: post, likeCount: override.likeCount, commentDelta: 0)
    }

    private func currentLikeOverride(postId: String) -> LikeOverride? {
        likeOverrides[postId]
    }

    private func resolvedLikeCountForAck(postId: String, serverLikeCount: Int?) -> Int? {
        if let serverLikeCount {
            return max(0, serverLikeCount)
        }
        if let override = likeOverrides[postId] {
            return max(0, override.likeCount)
        }
        if let detailCount = detailSnapshots[postId]?.response.post.likeCount {
            return max(0, detailCount)
        }
        return nil
    }

    private func pruneExpiredLikeOverridesIfNeeded() {
        guard !likeOverrides.isEmpty else { return }
        let now = Date()
        likeOverrides = likeOverrides.filter { _, item in
            now.timeIntervalSince(item.updatedAt) <= Self.optimisticLikeWindow
        }
    }

    private func pruneExpiredLikeSyncsIfNeeded() {
        guard !pendingLikeSyncs.isEmpty else { return }
        let now = Date()
        pendingLikeSyncs = pendingLikeSyncs.filter { _, item in
            now.timeIntervalSince(item.updatedAt) <= Self.likeSyncRetentionWindow
        }
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
        likeOverrides = state.likeOverrides ?? [:]
        pendingLikeSyncs = state.pendingLikeSyncs ?? [:]
        pruneExpiredLikeOverridesIfNeeded()
        pruneExpiredLikeSyncsIfNeeded()
    }

    private func persist() {
        pruneExpiredLikeOverridesIfNeeded()
        pruneExpiredLikeSyncsIfNeeded()
        let state = PersistedState(
            postSnapshots: postSnapshots,
            boardSnapshots: boardSnapshots,
            homeSnapshots: homeSnapshots,
            rankingSnapshots: rankingSnapshots,
            detailSnapshots: detailSnapshots,
            scheduleSnapshots: scheduleSnapshots,
            likeOverrides: likeOverrides,
            pendingLikeSyncs: pendingLikeSyncs
        )
        guard let data = try? JSONEncoder().encode(state) else { return }
        UserDefaults.standard.set(data, forKey: Keys.persistedState)
    }
}
