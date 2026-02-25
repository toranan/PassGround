import SwiftUI

private struct CommentNode: Identifiable {
    let id: String
    let item: CommentItem
    var children: [CommentNode]
}

private let webPrimaryColor = Color(red: 79/255, green: 70/255, blue: 229/255)

struct PostDetailView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore

    private let api = APIClient()

    let exam: ExamSlug
    let boardSlug: String
    let postId: String

    @State private var detail: PostDetailResponse?
    @State private var loading = false
    @State private var message = ""

    @State private var likeCount = 0
    @State private var liked = false

    @State private var commentText = ""
    @State private var replyTargetID: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                if loading {
                    ProgressView("로딩 중...")
                        .padding(.top, 40)
                }

                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(message.contains("완료") ? .green : .red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                }

                if let detail {
                    postSection(detail)
                    actionSection(detail)
                    commentsSection(detail)
                    if !detail.isSamplePost && detail.writable {
                        composerSection
                    }
                }
            }
            .padding(.bottom, 16)
        }
        .background(Color(.systemGray6))
        .navigationTitle("게시글")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func postSection(_ detail: PostDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(detail.post.title)
                .font(.title3.bold())
                .foregroundStyle(.primary)

            HStack(spacing: 8) {
                Text(detail.post.authorName)
                Text("·")
                Text(detail.post.timeLabel)
                Text("·")
                Label("\(detail.post.viewCount)", systemImage: "eye")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Divider()

            Text(detail.post.content)
                .font(.body)
                .foregroundStyle(.primary)
                .lineSpacing(2)
                .textSelection(.enabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
    }

    @ViewBuilder
    private func actionSection(_ detail: PostDetailResponse) -> some View {
        HStack(spacing: 18) {
            Button {
                Task { await toggleLike() }
            } label: {
                Label("\(likeCount)", systemImage: liked ? "heart.fill" : "heart")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            Label("\(detail.comments.count)", systemImage: "message")
                .foregroundStyle(.secondary)
                .font(.subheadline)

            Spacer()
        }
        .font(.subheadline)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
    }

    @ViewBuilder
    private func commentsSection(_ detail: PostDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("댓글 \(detail.comments.count)개")
                .font(.headline)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

            if detail.comments.isEmpty {
                Text("아직 댓글이 없습니다.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)
            } else {
                VStack(spacing: 0) {
                    ForEach(commentTree(from: detail.comments)) { node in
                        commentRow(node: node, depth: 0)
                        Divider()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
    }

    private var composerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(replyTargetID == nil ? "댓글 작성" : "답글 작성")
                .font(.headline)

            if let replyTargetID {
                Text("답글 대상: \(replyTargetID)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("답글 취소") {
                    self.replyTargetID = nil
                }
                .font(.caption)
            }

            TextEditor(text: $commentText)
                .frame(minHeight: 84)
                .padding(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.gray.opacity(0.25), lineWidth: 1)
                )

            Button("등록") {
                Task { await submitComment() }
            }
            .buttonStyle(.borderedProminent)
            .tint(webPrimaryColor)
        }
        .padding(16)
        .background(Color.white)
    }

    private func commentRow(node: CommentNode, depth: Int) -> AnyView {
        AnyView(
            VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(node.item.authorName)
                    .font(.subheadline.weight(.semibold))
                if node.item.verificationLevel != "none" {
                    Text(node.item.verificationLevel)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.15), in: Capsule())
                }
                if detail?.adoptedCommentId == node.item.id {
                    Text("채택")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.yellow.opacity(0.2), in: Capsule())
                }
                Spacer()
                Text(node.item.timeLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(node.item.content)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 12) {
                if detail?.isSamplePost == false && detail?.writable == true {
                    Button("답글") {
                        replyTargetID = node.item.id
                    }
                    .font(.caption)
                }
                if canAdopt(comment: node.item) {
                    Button("채택") {
                        Task { await adopt(commentID: node.item.id) }
                    }
                    .font(.caption)
                }
            }
            .foregroundStyle(.secondary)

            ForEach(node.children) { child in
                commentRow(node: child, depth: depth + 1)
                    .padding(.leading, 12)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(depth > 0 ? Color.gray.opacity(0.04) : Color.clear)
        )
    }

    private func canAdopt(comment: CommentItem) -> Bool {
        guard let detail else { return false }
        if detail.adoptedCommentId != nil { return false }
        if detail.isSamplePost || !detail.writable { return false }
        if session.displayName.isEmpty { return false }
        return session.displayName == detail.post.authorName && session.displayName != comment.authorName
    }

    private func commentTree(from comments: [CommentItem]) -> [CommentNode] {
        var nodeMap: [String: CommentNode] = [:]
        comments.forEach { comment in
            nodeMap[comment.id] = CommentNode(id: comment.id, item: comment, children: [])
        }

        var roots: [CommentNode] = []
        for comment in comments {
            guard let current = nodeMap[comment.id] else { continue }
            if let parentID = comment.parentId, var parent = nodeMap[parentID] {
                parent.children.append(current)
                nodeMap[parentID] = parent
            } else {
                roots.append(current)
            }
        }

        return roots.map { rebuild(node: $0, map: nodeMap) }
    }

    private func rebuild(node: CommentNode, map: [String: CommentNode]) -> CommentNode {
        let children = (map[node.id]?.children ?? []).map { rebuild(node: $0, map: map) }
        return CommentNode(id: node.id, item: node.item, children: children)
    }

    private func load() async {
        loading = true
        message = ""
        do {
            let response = try await api.fetchPostDetail(
                baseURL: config.baseURL,
                exam: exam,
                board: boardSlug,
                postId: postId,
                userId: session.user?.id
            )
            detail = response
            likeCount = response.post.likeCount
            liked = response.viewerLiked ?? false
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    private func toggleLike() async {
        guard let userID = session.user?.id else {
            message = "로그인 후 이용해 주세요."
            return
        }
        do {
            let response = try await api.toggleLike(baseURL: config.baseURL, postId: postId, userId: userID)
            liked = response.liked
            likeCount += response.liked ? 1 : -1
            if likeCount < 0 { likeCount = 0 }
        } catch {
            message = error.localizedDescription
        }
    }

    private func submitComment() async {
        guard !commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            message = "댓글 내용을 입력해 주세요."
            return
        }
        do {
            try await api.createComment(
                baseURL: config.baseURL,
                postId: postId,
                parentId: replyTargetID,
                authorName: session.displayName.isEmpty ? "익명" : session.displayName,
                content: commentText
            )
            commentText = ""
            replyTargetID = nil
            message = "등록 완료"
            await load()
        } catch {
            message = error.localizedDescription
        }
    }

    private func adopt(commentID: String) async {
        do {
            let adopter = session.displayName
            _ = try await api.adoptComment(
                baseURL: config.baseURL,
                postId: postId,
                commentId: commentID,
                adopterName: adopter
            )
            message = "채택 완료"
            await load()
        } catch {
            message = error.localizedDescription
        }
    }
}
