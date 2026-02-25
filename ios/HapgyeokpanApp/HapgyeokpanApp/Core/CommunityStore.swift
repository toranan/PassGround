import Foundation

@MainActor
final class CommunityStore: ObservableObject {
    static let freshWindow: TimeInterval = 25

    struct PostsSnapshot {
        let posts: [PostSummary]
        let nextCursor: String?
        let hasMore: Bool
        let updatedAt: Date
    }

    private var postSnapshots: [String: PostsSnapshot] = [:]

    private func key(exam: ExamSlug, board: String) -> String {
        "\(exam.rawValue)#\(board)"
    }

    func postsSnapshot(exam: ExamSlug, board: String) -> PostsSnapshot? {
        postSnapshots[key(exam: exam, board: board)]
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
    }

    func updateLikeCount(postId: String, likeCount: Int) {
        guard !postId.isEmpty else { return }
        let safeCount = max(0, likeCount)
        for (snapshotKey, snapshot) in postSnapshots {
            var changed = false
            let updatedPosts = snapshot.posts.map { post -> PostSummary in
                guard post.id == postId else { return post }
                changed = true
                return PostSummary(
                    id: post.id,
                    title: post.title,
                    content: post.content,
                    authorName: post.authorName,
                    commentCount: post.commentCount,
                    likeCount: safeCount,
                    viewCount: post.viewCount,
                    timeLabel: post.timeLabel,
                    createdAt: post.createdAt,
                    isSample: post.isSample
                )
            }
            if changed {
                postSnapshots[snapshotKey] = PostsSnapshot(
                    posts: updatedPosts,
                    nextCursor: snapshot.nextCursor,
                    hasMore: snapshot.hasMore,
                    updatedAt: Date()
                )
            }
        }
    }
}
