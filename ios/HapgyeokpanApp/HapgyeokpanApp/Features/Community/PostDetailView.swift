import SwiftUI

private struct CommentNode: Identifiable {
    let id: String
    let item: CommentItem
    var children: [CommentNode]
}

private struct PostResourceItem: Identifiable {
    enum Kind {
        case link
        case file
    }

    let id: String
    let title: String
    let url: URL
    let kind: Kind
}

private struct ParsedPostContent {
    let bodyText: String
    let links: [PostResourceItem]
    let files: [PostResourceItem]
}

private let commentAccentColor = Color(red: 47/255, green: 158/255, blue: 108/255)

struct PostDetailView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var communityStore: CommunityStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()
    private let likeDebounceNanoseconds: UInt64 = 280_000_000

    let exam: ExamSlug
    let boardSlug: String
    let postId: String
    let initialPost: PostSummary?
    let boardName: String?

    @State private var detail: PostDetailResponse?
    @State private var loading = false
    @State private var message = ""
    @State private var hasLoadedRemote = false
    @State private var didBootstrap = false

    @State private var likeCount = 0
    @State private var liked = false
    @State private var operationRevision = 0
    @State private var lastLikeMutationRevision = 0
    @State private var likeSyncInFlight = false
    @State private var likeSyncDebounceTask: Task<Void, Never>?

    @State private var commentText = ""
    @State private var replyTargetID: String?
    @State private var commentAnonymous = true
    @FocusState private var commentInputFocused: Bool

    init(
        exam: ExamSlug,
        boardSlug: String,
        postId: String,
        initialPost: PostSummary? = nil,
        boardName: String? = nil
    ) {
        self.exam = exam
        self.boardSlug = boardSlug
        self.postId = postId
        self.initialPost = initialPost
        self.boardName = boardName

        if let initialPost {
            _detail = State(initialValue: Self.seedDetail(from: initialPost, boardSlug: boardSlug, boardName: boardName))
            _likeCount = State(initialValue: max(0, initialPost.likeCount))
        } else {
            _detail = State(initialValue: nil)
            _likeCount = State(initialValue: 0)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 8) {
                    if loading && detail == nil {
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
                    }
                }
                .padding(.bottom, 16)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                commentInputFocused = false
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .background(Color(.systemGray6))
        .navigationTitle("게시글")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let detail, !detail.isSamplePost && detail.writable {
                VStack(spacing: 0) {
                    Divider()
                    composerSection
                }
                .background(Color(.systemBackground))
            }
        }
        .task {
            guard !didBootstrap else { return }
            didBootstrap = true
            _ = applyCachedDetailSnapshotIfAvailable()
            scheduleLikeSyncFlush(immediate: true)
            await load()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                scheduleLikeSyncFlush(immediate: true)
            }
        }
        .onDisappear {
            scheduleLikeSyncFlush(immediate: true)
        }
        .refreshable { await load(forceRefresh: true) }
    }

    @ViewBuilder
    private func postSection(_ detail: PostDetailResponse) -> some View {
        let parsed = parsePostContent(detail.post.content)

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

            if !parsed.bodyText.isEmpty {
                if let markdownContent = try? AttributedString(markdown: parsed.bodyText) {
                    Text(markdownContent)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineSpacing(2)
                        .textSelection(.enabled)
                        .tint(commentAccentColor)
                } else {
                    Text(parsed.bodyText)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineSpacing(2)
                        .textSelection(.enabled)
                }
            }

            if !parsed.links.isEmpty || !parsed.files.isEmpty {
                Divider()
                resourceSection(links: parsed.links, files: parsed.files)
            }
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
                    .foregroundStyle(liked ? commentAccentColor : .secondary)
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
            if detail.comments.isEmpty {
                Text(hasLoadedRemote ? "아직 댓글이 없습니다." : "댓글 불러오는 중...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
            } else {
                VStack(spacing: 0) {
                    ForEach(commentTree(from: detail.comments)) { node in
                        commentRow(node: node, depth: 0)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
    }

    @ViewBuilder
    private func resourceSection(links: [PostResourceItem], files: [PostResourceItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !links.isEmpty {
                Text("관련 링크")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(links) { item in
                        Link(destination: item.url) {
                            Label(item.title, systemImage: "link")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(commentAccentColor)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }

            if !files.isEmpty {
                Text("첨부 파일")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.top, links.isEmpty ? 0 : 4)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(files) { item in
                        Link(destination: item.url) {
                            Label(item.title, systemImage: "paperclip")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(commentAccentColor)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Color(UIColor.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func parsePostContent(_ raw: String) -> ParsedPostContent {
        let markdownPattern = #"^(?:[🔗📎]\s*)?\[([^\]]+)\]\((https?://[^\s)]+)\)\s*$"#
        let urlLinePattern = #"^(?:[🔗📎]\s*)?(https?://\S+)\s*$"#

        guard
            let markdownRegex = try? NSRegularExpression(pattern: markdownPattern, options: [.caseInsensitive]),
            let urlLineRegex = try? NSRegularExpression(pattern: urlLinePattern, options: [.caseInsensitive])
        else {
            return ParsedPostContent(bodyText: raw, links: [], files: [])
        }

        var bodyLines: [String] = []
        var links: [PostResourceItem] = []
        var files: [PostResourceItem] = []
        var seen = Set<String>()

        for line in raw.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                bodyLines.append(line)
                continue
            }

            let fullRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)

            if let match = markdownRegex.firstMatch(in: trimmed, options: [], range: fullRange),
               let titleRange = Range(match.range(at: 1), in: trimmed),
               let urlRange = Range(match.range(at: 2), in: trimmed) {
                let title = String(trimmed[titleRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                let urlString = String(trimmed[urlRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                if let resource = buildResourceItem(
                    line: trimmed,
                    title: title.isEmpty ? "링크 열기" : title,
                    urlString: urlString,
                    seen: &seen
                ) {
                    switch resource.kind {
                    case .link:
                        links.append(resource)
                    case .file:
                        files.append(resource)
                    }
                    continue
                }
            }

            if let match = urlLineRegex.firstMatch(in: trimmed, options: [], range: fullRange),
               let urlRange = Range(match.range(at: 1), in: trimmed) {
                let urlString = String(trimmed[urlRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                if let resource = buildResourceItem(
                    line: trimmed,
                    title: "링크 열기",
                    urlString: urlString,
                    seen: &seen
                ) {
                    switch resource.kind {
                    case .link:
                        links.append(resource)
                    case .file:
                        files.append(resource)
                    }
                    continue
                }
            }

            bodyLines.append(line)
        }

        let bodyText = bodyLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return ParsedPostContent(
            bodyText: bodyText,
            links: links,
            files: files
        )
    }

    private func buildResourceItem(
        line: String,
        title: String,
        urlString: String,
        seen: inout Set<String>
    ) -> PostResourceItem? {
        guard let url = URL(string: urlString) else { return nil }
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }

        let markedAsFile = line.contains("📎")
        let inferredAsFile = isLikelyFile(url: url, title: title)
        let kind: PostResourceItem.Kind = (markedAsFile || inferredAsFile) ? .file : .link

        let dedupKey = "\(kind == .file ? "file" : "link")#\(url.absoluteString)"
        if seen.contains(dedupKey) { return nil }
        seen.insert(dedupKey)

        let resolvedTitle: String
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title == "링크 열기" {
            let fallback = url.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
            resolvedTitle = fallback.isEmpty ? "링크 열기" : fallback
        } else {
            resolvedTitle = title
        }

        return PostResourceItem(
            id: dedupKey,
            title: resolvedTitle,
            url: url,
            kind: kind
        )
    }

    private func isLikelyFile(url: URL, title: String) -> Bool {
        let fileExtensions = Set([
            "pdf", "zip", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
            "jpg", "jpeg", "png", "gif", "webp", "heic", "txt", "csv"
        ])
        let ext = url.pathExtension.lowercased()
        if fileExtensions.contains(ext) {
            return true
        }
        let loweredTitle = title.lowercased()
        if fileExtensions.contains((loweredTitle as NSString).pathExtension.lowercased()) {
            return true
        }
        return url.path.lowercased().contains("/attachments/")
    }

    private var composerSection: some View {
        HStack(spacing: 10) {
            Button {
                commentAnonymous.toggle()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: commentAnonymous ? "checkmark.square.fill" : "square")
                        .font(.system(size: 16, weight: .semibold))
                    Text("익명")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(commentAnonymous ? commentAccentColor : .secondary)
            }
            .buttonStyle(.plain)

            TextField(
                replyTargetID == nil ? "댓글을 입력하세요." : "답글을 입력하세요.",
                text: $commentText,
                axis: .vertical
            )
            .font(.subheadline)
            .lineLimit(1...3)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .focused($commentInputFocused)

            if replyTargetID != nil {
                Button("취소") {
                    replyTargetID = nil
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Button {
                Task { await submitComment() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(commentAccentColor)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(.systemGray4), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func commentRow(node: CommentNode, depth: Int) -> AnyView {
        let isReply = depth > 0
        let isAuthor = node.item.authorName == detail?.post.authorName
        return AnyView(
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 8) {
                    if isReply {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color(.systemGray3))
                            .padding(.top, 14)
                            .padding(.leading, 10)
                    }

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "person.fill")
                            .resizable()
                            .scaledToFit()
                            .padding(5)
                            .frame(width: 28, height: 28)
                            .background(Color(.systemGray4))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .foregroundStyle(.white)

                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .top, spacing: 8) {
                                Text(node.item.authorName)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(isAuthor ? commentAccentColor : .primary)

                                if node.item.verificationLevel != "none" {
                                    Text(node.item.verificationLevel)
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.orange.opacity(0.14), in: Capsule())
                                }

                                if detail?.adoptedCommentId == node.item.id {
                                    Text("채택")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.yellow.opacity(0.2), in: Capsule())
                                }

                                Spacer()

                                HStack(spacing: 8) {
                                    if detail?.isSamplePost == false && detail?.writable == true {
                                        Button("답글") {
                                            replyTargetID = node.item.id
                                        }
                                    }
                                    if canAdopt(comment: node.item) {
                                        Button("채택") {
                                            Task { await adopt(commentID: node.item.id) }
                                        }
                                    }
                                }
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color(.systemGray2))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(isReply ? Color.white : Color(.systemGray6), in: RoundedRectangle(cornerRadius: 6))
                            }

                            Text(node.item.content)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineSpacing(2)
                                .fixedSize(horizontal: false, vertical: true)

                            Text(node.item.timeLabel)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.all, isReply ? 12 : 14)
                    .background(isReply ? Color(.systemGray6).opacity(0.8) : Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: isReply ? 10 : 0))
                    .padding(.trailing, 12)
                    .padding(.vertical, isReply ? 6 : 0)
                }

                if !isReply {
                    Rectangle()
                        .frame(height: 1)
                        .foregroundStyle(Color(.systemGray6))
                }

                ForEach(node.children) { child in
                    commentRow(node: child, depth: depth + 1)
                }
            }
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

    private func load(forceRefresh: Bool = false) async {
        operationRevision += 1
        let loadRevision = operationRevision

        let needsBlockingLoading = (detail == nil)
        if needsBlockingLoading {
            loading = true
        }
        message = ""
        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        defer {
            if needsBlockingLoading {
                loading = false
            }
        }
        do {
            let response = try await api.fetchPostDetail(
                baseURL: config.baseURL,
                exam: exam,
                board: boardSlug,
                postId: postId,
                userId: session.user?.id,
                cachePolicy: cachePolicy
            )
            let responseWithOverrides = communityStore.mergeLikeOverrides(
                response: response,
                viewerUserID: session.user?.id
            )

            let shouldKeepLocalLike = loadRevision < lastLikeMutationRevision
            let resolvedLiked = shouldKeepLocalLike ? liked : (responseWithOverrides.viewerLiked ?? false)
            let resolvedLikeCount = shouldKeepLocalLike ? likeCount : responseWithOverrides.post.likeCount
            let resolvedResponse = withLikeState(responseWithOverrides, likeCount: resolvedLikeCount, liked: resolvedLiked)

            detail = resolvedResponse
            likeCount = resolvedLikeCount
            liked = resolvedLiked
            hasLoadedRemote = true
            communityStore.savePostDetailSnapshot(
                postId: postId,
                response: resolvedResponse,
                viewerUserID: session.user?.id
            )
        } catch {
            if isCancellation(error) {
                return
            }
            message = error.localizedDescription
        }
    }

    @MainActor
    private func toggleLike() async {
        guard let userID = session.user?.id else {
            message = "로그인 후 이용해 주세요."
            return
        }

        operationRevision += 1
        lastLikeMutationRevision = operationRevision

        // Optimistic update: reflect immediately. Server sync is queued in background.
        let optimisticLiked = !liked
        liked = optimisticLiked
        likeCount = max(0, likeCount + (optimisticLiked ? 1 : -1))
        communityStore.updateLikeCount(
            postId: postId,
            likeCount: likeCount,
            viewerLiked: optimisticLiked,
            viewerUserID: userID
        )
        communityStore.enqueueLikeSync(
            postId: postId,
            desiredLiked: optimisticLiked,
            viewerUserID: userID
        )
        scheduleLikeSyncFlush(immediate: false)
    }

    private func scheduleLikeSyncFlush(immediate: Bool) {
        likeSyncDebounceTask?.cancel()
        let delay = immediate ? UInt64(0) : likeDebounceNanoseconds
        likeSyncDebounceTask = Task {
            if delay > 0 {
                try? await Task.sleep(nanoseconds: delay)
            }
            await flushLikeSyncQueue()
        }
    }

    @MainActor
    private func flushLikeSyncQueue() async {
        guard let userID = session.user?.id else { return }
        guard !likeSyncInFlight else { return }
        likeSyncInFlight = true
        defer { likeSyncInFlight = false }

        while let pending = communityStore.nextReadyLikeSync(viewerUserID: userID) {
            do {
                let response = try await api.toggleLike(
                    baseURL: config.baseURL,
                    postId: pending.postId,
                    userId: userID,
                    desiredLiked: pending.desiredLiked
                )
                let applied = communityStore.completeLikeSync(
                    postId: pending.postId,
                    viewerUserID: userID,
                    ackRevision: pending.revision,
                    serverLiked: response.liked,
                    serverLikeCount: response.likeCount
                )
                guard applied else { continue }

                if pending.postId == postId {
                    liked = response.liked
                    if let serverLikeCount = response.likeCount {
                        likeCount = max(0, serverLikeCount)
                    }
                }
            } catch {
                if isCancellation(error) { return }
                communityStore.markLikeSyncFailure(
                    postId: pending.postId,
                    viewerUserID: userID,
                    ackRevision: pending.revision
                )
                break
            }
        }
    }

    private func withLikeState(_ response: PostDetailResponse, likeCount: Int, liked: Bool) -> PostDetailResponse {
        PostDetailResponse(
            ok: response.ok,
            writable: response.writable,
            isSamplePost: response.isSamplePost,
            viewerLiked: liked,
            board: response.board,
            post: PostDetail(
                id: response.post.id,
                title: response.post.title,
                content: response.post.content,
                authorName: response.post.authorName,
                createdAt: response.post.createdAt,
                timeLabel: response.post.timeLabel,
                viewCount: response.post.viewCount,
                likeCount: likeCount
            ),
            adoptedCommentId: response.adoptedCommentId,
            comments: response.comments
        )
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
                authorName: commentAnonymous ? "익명" : (session.displayName.isEmpty ? "익명" : session.displayName),
                content: commentText,
                userId: session.user?.id,
                accessToken: session.accessToken
            )
            commentText = ""
            replyTargetID = nil
            commentInputFocused = false
            message = "등록 완료"
            communityStore.incrementCommentCount(postId: postId, delta: 1)
            await load(forceRefresh: true)
        } catch {
            if isCancellation(error) { return }
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
            if isCancellation(error) { return }
            message = error.localizedDescription
        }
    }

    private func isCancellation(_ error: Error) -> Bool {
        APIClient.isCancellationError(error)
    }

    @discardableResult
    private func applyCachedDetailSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.postDetailSnapshot(postId: postId, viewerUserID: session.user?.id) else {
            return false
        }
        detail = snapshot.response
        likeCount = snapshot.response.post.likeCount
        liked = snapshot.response.viewerLiked ?? false
        hasLoadedRemote = true
        return Date().timeIntervalSince(snapshot.updatedAt) <= CommunityStore.detailFreshWindow
    }

    private static func seedDetail(
        from post: PostSummary,
        boardSlug: String,
        boardName: String?
    ) -> PostDetailResponse {
        let previewContent = (post.content?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            ? (post.content ?? "")
            : "본문 불러오는 중..."

        return PostDetailResponse(
            ok: true,
            writable: false,
            isSamplePost: false,
            viewerLiked: nil,
            board: BoardMetaLite(slug: boardSlug, name: boardName ?? "게시판"),
            post: PostDetail(
                id: post.id,
                title: post.title,
                content: previewContent,
                authorName: post.authorName,
                createdAt: post.createdAt,
                timeLabel: post.timeLabel,
                viewCount: post.viewCount,
                likeCount: max(0, post.likeCount)
            ),
            adoptedCommentId: nil,
            comments: []
        )
    }
}
