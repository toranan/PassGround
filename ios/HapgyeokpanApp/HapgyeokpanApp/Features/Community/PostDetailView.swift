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

private struct SuccessToastView: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
            Text(text)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.06, green: 0.72, blue: 0.47),
                    Color(red: 0.05, green: 0.57, blue: 0.38),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(Capsule())
        .shadow(color: Color.black.opacity(0.18), radius: 12, x: 0, y: 4)
    }
}

private struct PostEditSheetView: View {
    @Environment(\.dismiss) private var dismiss

    let onSave: (String, String) async throws -> Void

    @State private var title: String
    @State private var content: String
    @State private var isSaving = false
    @State private var errorMessage = ""

    init(initialTitle: String, initialContent: String, onSave: @escaping (String, String) async throws -> Void) {
        self.onSave = onSave
        _title = State(initialValue: initialTitle)
        _content = State(initialValue: initialContent)
    }

    var body: some View {
        VStack(spacing: 0) {
            TextField("제목", text: $title)
                .font(.headline)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

            Divider()

            TextEditor(text: $content)
                .font(.body)
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
            }
        }
        .navigationTitle("게시글 수정")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("취소") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("저장")
                    }
                }
                .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    @MainActor
    private func submit() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = "제목을 입력해 주세요."
            return
        }
        guard !trimmedContent.isEmpty else {
            errorMessage = "내용을 입력해 주세요."
            return
        }
        guard !isSaving else { return }

        isSaving = true
        defer { isSaving = false }

        do {
            try await onSave(trimmedTitle, trimmedContent)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private let commentAccentColor = Color(red: 47/255, green: 158/255, blue: 108/255)

struct PostDetailView: View {
    @Environment(\.dismiss) private var dismiss
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
    @State private var showEditPostSheet = false
    @State private var showDeletePostAlert = false
    @State private var showDeleteCommentAlert = false
    @State private var showLoginPrompt = false
    @State private var pendingDeleteCommentID: String?
    @State private var successToastText: String?
    @State private var successToastTask: Task<Void, Never>?

    @State private var likeCount = 0
    @State private var liked = false
    @State private var operationRevision = 0
    @State private var lastLikeMutationRevision = 0
    @State private var likeSyncInFlight = false
    @State private var likeSyncDebounceTask: Task<Void, Never>?

    @State private var commentText = ""
    @State private var replyTargetID: String?
    @State private var commentAnonymous = true
    @State private var commentSubmitInFlight = false
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
                        VStack(spacing: 0) {
                            postSection(detail)
                            Divider()
                            actionSection(detail)
                            Divider()
                            commentsSection(detail)
                        }
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let detail, canDeletePost(detail) {
                        Button("수정") {
                            showEditPostSheet = true
                        }
                        Button(role: .destructive) {
                            showDeletePostAlert = true
                        } label: {
                            Text("삭제")
                        }
                    } else {
                        Button("신고") {
                            message = "준비 중인 기능입니다."
                        }
                        Button("차단") {
                            message = "준비 중인 기능입니다."
                        }
                    }
                } label: {
                    Text("⋮")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color(.systemGray2))
                        .padding(.horizontal, 6)
                }
            }
        }
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
            successToastTask?.cancel()
        }
        .refreshable { await load(forceRefresh: true) }
        .overlay(alignment: .top) {
            if let successToastText {
                SuccessToastView(text: successToastText)
                    .padding(.top, 10)
                    .padding(.horizontal, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: successToastText != nil)
        .sheet(isPresented: $showEditPostSheet) {
            if let detail {
                NavigationStack {
                    PostEditSheetView(
                        initialTitle: detail.post.title,
                        initialContent: detail.post.content
                    ) { title, content in
                        try await updatePost(title: title, content: content)
                    }
                }
            }
        }
        .sheet(isPresented: $showLoginPrompt) {
            CommunityLoginPromptSheet(
                title: "로그인이 필요해",
                message: "커뮤니티 기능은 로그인 후 사용할 수 있어. 아래에서 바로 로그인해줘."
            )
        }
        .alert("게시글 삭제", isPresented: $showDeletePostAlert) {
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                Task { await deletePost() }
            }
        } message: {
            Text("정말 이 글을 삭제할까?")
        }
        .alert("댓글 삭제", isPresented: $showDeleteCommentAlert) {
            Button("취소", role: .cancel) {
                pendingDeleteCommentID = nil
            }
            Button("삭제", role: .destructive) {
                guard let commentID = pendingDeleteCommentID else { return }
                Task { await deleteComment(commentID: commentID) }
            }
        } message: {
            Text("선택한 댓글을 삭제할까?")
        }
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
                if let badge = detail.post.verificationLevel, badge != "none", !badge.isEmpty {
                    Text(badge)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.14), in: Capsule())
                }
                Text("·")
                Text(detail.post.timeLabel)
                Text("·")
                Label("\(detail.post.viewCount)", systemImage: "eye")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Divider()

            if !parsed.bodyText.isEmpty {
                Text(parsed.bodyText)
                    .font(.body)
                    .foregroundStyle(Color(UIColor.darkText))
                    .lineSpacing(6)
                    .textSelection(.enabled)
            }

            if !parsed.links.isEmpty || !parsed.files.isEmpty {
                Divider()
                    .padding(.vertical, 4)
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
            .opacity(session.isLoggedIn ? 1 : 0.65)
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
        VStack(spacing: 10) {
            ForEach(files) { item in
                resourceCard(item: item)
            }
            ForEach(links) { item in
                resourceCard(item: item)
            }
        }
        .padding(.top, 4)
    }

    private func resourceCard(item: PostResourceItem) -> some View {
        let isFile = item.kind == .file
        return Link(destination: item.url) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(isFile ? commentAccentColor.opacity(0.12) : Color.blue.opacity(0.12))
                        .frame(width: 38, height: 38)
                    
                    Image(systemName: isFile ? "doc.text.fill" : "link")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(isFile ? commentAccentColor : Color.blue)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        
                    Text(isFile ? "첨부파일" : "관련 링크")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color(.systemGray3))
            }
            .padding(12)
            .background(Color(.systemBackground))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func parsePostContent(_ raw: String) -> ParsedPostContent {
        var bodyText = raw
        var links: [PostResourceItem] = []
        var files: [PostResourceItem] = []
        var seen = Set<String>()

        let markdownPattern = #"(?:[🔗📎]\s*)?\[(.*?)\]\((https?://[^\s)]+)\)"#
        if let regex = try? NSRegularExpression(pattern: markdownPattern, options: [.caseInsensitive]) {
            let matches = regex.matches(in: bodyText, options: [], range: NSRange(bodyText.startIndex..., in: bodyText))
            for match in matches.reversed() {
                if let titleRange = Range(match.range(at: 1), in: bodyText),
                   let urlRange = Range(match.range(at: 2), in: bodyText),
                   let fullRange = Range(match.range(at: 0), in: bodyText) {
                    
                    let title = String(bodyText[titleRange])
                    let urlString = String(bodyText[urlRange])
                    
                    if let resource = buildResourceItem(title: title, urlString: urlString, seen: &seen) {
                        if resource.kind == .file { files.insert(resource, at: 0) }
                        else { links.insert(resource, at: 0) }
                    }
                    bodyText.removeSubrange(fullRange)
                }
            }
        }

        let urlPattern = #"(?<!\()https?://\S+(?!\))"#
        if let regex = try? NSRegularExpression(pattern: urlPattern, options: [.caseInsensitive]) {
            let matches = regex.matches(in: bodyText, options: [], range: NSRange(bodyText.startIndex..., in: bodyText))
            for match in matches.reversed() {
                if let fullRange = Range(match.range(at: 0), in: bodyText) {
                    let urlString = String(bodyText[fullRange])
                    if let resource = buildResourceItem(title: "링크 열기", urlString: urlString, seen: &seen) {
                        if resource.kind == .file { files.insert(resource, at: 0) }
                        else { links.insert(resource, at: 0) }
                    }
                    bodyText.removeSubrange(fullRange)
                }
            }
        }

        return ParsedPostContent(
            bodyText: bodyText.trimmingCharacters(in: .whitespacesAndNewlines),
            links: links,
            files: files
        )
    }

    private func buildResourceItem(
        title: String,
        urlString: String,
        seen: inout Set<String>
    ) -> PostResourceItem? {
        guard let url = URL(string: urlString) else { return nil }
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }

        let kind: PostResourceItem.Kind = isLikelyFile(url: url, title: title) ? .file : .link

        let dedupKey = "\(kind == .file ? "file" : "link")#\(url.absoluteString)"
        if seen.contains(dedupKey) { return nil }
        seen.insert(dedupKey)

        let resolvedTitle: String
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanTitle.isEmpty || cleanTitle == "링크 열기" || cleanTitle == "관련 링크" {
            let fallback = url.host ?? url.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
            resolvedTitle = fallback.isEmpty ? "링크 열기" : fallback
        } else {
            resolvedTitle = cleanTitle
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
        let trimmedComment = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        let canWriteComment = session.isLoggedIn
        let sendButtonDisabled = commentSubmitInFlight || (canWriteComment && trimmedComment.isEmpty)
        return HStack(spacing: 10) {
            Button {
                if !canWriteComment {
                    showLoginPrompt = true
                    return
                }
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

            if canWriteComment {
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
            } else {
                Button {
                    showLoginPrompt = true
                } label: {
                    HStack {
                        Text("로그인 후 댓글을 작성할 수 있어")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
            }

            if replyTargetID != nil {
                Button("취소") {
                    replyTargetID = nil
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Button {
                if !canWriteComment {
                    showLoginPrompt = true
                    return
                }
                Task { await submitComment() }
            } label: {
                Group {
                    if commentSubmitInFlight {
                        ProgressView()
                            .tint(commentAccentColor)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(commentAccentColor)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(sendButtonDisabled)
            .opacity(sendButtonDisabled ? 0.45 : 1)
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

                        VStack(alignment: .leading, spacing: 3) {
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

                                Spacer(minLength: 0)

                                if canAdopt(comment: node.item) || canDeleteComment(node.item) {
                                    Menu {
                                        if canAdopt(comment: node.item) {
                                            Button {
                                                Task { await adopt(commentID: node.item.id) }
                                            } label: {
                                                Label("채택하기", systemImage: "checkmark.circle")
                                            }
                                        }
                                        if canDeleteComment(node.item) {
                                            Button(role: .destructive) {
                                                pendingDeleteCommentID = node.item.id
                                                showDeleteCommentAlert = true
                                            } label: {
                                                Label("삭제하기", systemImage: "trash")
                                            }
                                        }
                                    } label: {
                                        Text("⋮")
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundStyle(Color(.systemGray3))
                                            .contentShape(Rectangle())
                                    }
                                }
                            }

                            Text(node.item.content)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineSpacing(2)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, -1.5)

                            HStack(alignment: .center, spacing: 12) {
                                Text(node.item.timeLabel)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                
                                if detail?.isSamplePost == false && detail?.writable == true && session.isLoggedIn {
                                    Button {
                                        replyTargetID = node.item.id
                                        commentInputFocused = true
                                    } label: {
                                        HStack(spacing: 3) {
                                            Image(systemName: "bubble.right")
                                            Text("답글")
                                        }
                                    }
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(Color(.systemGray2))
                                    .buttonStyle(.plain)
                                }
                                if detail?.isSamplePost == false && detail?.writable == true && !session.isLoggedIn {
                                    Button {
                                        showLoginPrompt = true
                                    } label: {
                                        HStack(spacing: 3) {
                                            Image(systemName: "bubble.right")
                                            Text("답글")
                                        }
                                    }
                                    .font(.caption2.weight(.medium))
                                    .foregroundStyle(Color(.systemGray2))
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.top, 2)
                        }
                    }
                    .padding(.top, isReply ? 8 : 11)
                    .padding(.bottom, isReply ? 6 : 6)
                    .padding(.horizontal, isReply ? 12 : 14)
                    .background(isReply ? Color(.systemGray6).opacity(0.8) : Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: isReply ? 10 : 0))
                    .padding(.trailing, 12)
                    .padding(.top, isReply ? 4 : 0)
                    .padding(.bottom, isReply ? 2 : 4)
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

    private func canDeletePost(_ detail: PostDetailResponse) -> Bool {
        guard detail.isSamplePost == false else { return false }
        if detail.viewerCanDelete == true { return true }
        if let userID = session.user?.id, !userID.isEmpty,
           let authorID = detail.post.authorId, !authorID.isEmpty {
            return authorID == userID
        }
        let authorName = detail.post.authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        let viewerName = session.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !authorName.isEmpty && authorName != "익명" && !viewerName.isEmpty {
            return authorName == viewerName
        }
        return false
    }

    private func canDeleteComment(_ comment: CommentItem) -> Bool {
        if comment.canDelete == true { return true }
        if let userID = session.user?.id, !userID.isEmpty,
           let authorID = comment.authorId, !authorID.isEmpty {
            return authorID == userID
        }
        let authorName = comment.authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        let viewerName = session.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !authorName.isEmpty && authorName != "익명" && !viewerName.isEmpty {
            return authorName == viewerName
        }
        return false
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
            showLoginPrompt = true
            return
        }
        let accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            message = "로그인이 만료됐어. 마이페이지에서 다시 로그인해줘."
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
        let accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else { return }
        guard !likeSyncInFlight else { return }
        likeSyncInFlight = true
        defer { likeSyncInFlight = false }

        while let pending = communityStore.nextReadyLikeSync(viewerUserID: userID) {
            do {
                let response = try await api.toggleLike(
                    baseURL: config.baseURL,
                    postId: pending.postId,
                    userId: userID,
                    desiredLiked: pending.desiredLiked,
                    accessToken: accessToken
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
            viewerCanDelete: response.viewerCanDelete,
            board: response.board,
            post: PostDetail(
                id: response.post.id,
                title: response.post.title,
                content: response.post.content,
                authorName: response.post.authorName,
                authorId: response.post.authorId,
                verificationLevel: response.post.verificationLevel,
                createdAt: response.post.createdAt,
                timeLabel: response.post.timeLabel,
                viewCount: response.post.viewCount,
                likeCount: likeCount
            ),
            adoptedCommentId: response.adoptedCommentId,
            comments: response.comments
        )
    }

    @MainActor
    private func submitComment() async {
        guard let userId = session.user?.id, !userId.isEmpty else {
            showLoginPrompt = true
            return
        }
        let accessToken = session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            message = "로그인이 만료됐어. 마이페이지에서 다시 로그인해줘."
            return
        }

        let trimmed = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            message = "댓글 내용을 입력해 주세요."
            return
        }
        guard !commentSubmitInFlight else { return }

        commentSubmitInFlight = true
        defer { commentSubmitInFlight = false }

        do {
            try await api.createComment(
                baseURL: config.baseURL,
                postId: postId,
                parentId: replyTargetID,
                authorName: commentAnonymous ? "익명" : (session.displayName.isEmpty ? "익명" : session.displayName),
                content: trimmed,
                userId: userId,
                accessToken: accessToken
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

    private func deletePost() async {
        guard let userID = session.user?.id else {
            message = "로그인 후 이용해 주세요."
            return
        }
        guard !session.accessToken.isEmpty else {
            message = "로그인 정보가 만료되었습니다."
            return
        }

        do {
            try await api.deletePost(
                baseURL: config.baseURL,
                postId: postId,
                userId: userID,
                accessToken: session.accessToken
            )
            communityStore.removePost(postId: postId)
            showSuccessToast("게시글이 삭제되었어")
            try? await Task.sleep(nanoseconds: 800_000_000)
            dismiss()
        } catch {
            if isCancellation(error) { return }
            message = error.localizedDescription
        }
    }

    @MainActor
    private func updatePost(title: String, content: String) async throws {
        guard let userID = session.user?.id else {
            throw APIClientError.server(message: "로그인 후 이용해 주세요.")
        }
        guard !session.accessToken.isEmpty else {
            throw APIClientError.server(message: "로그인 정보가 만료되었습니다.")
        }

        try await api.updatePost(
            baseURL: config.baseURL,
            postId: postId,
            title: title,
            content: content,
            userId: userID,
            accessToken: session.accessToken
        )

        message = "수정 완료"
        await load(forceRefresh: true)
    }

    private func deleteComment(commentID: String) async {
        guard let userID = session.user?.id else {
            message = "로그인 후 이용해 주세요."
            pendingDeleteCommentID = nil
            return
        }
        guard !session.accessToken.isEmpty else {
            message = "로그인 정보가 만료되었습니다."
            pendingDeleteCommentID = nil
            return
        }

        do {
            let deletedCount = try await api.deleteComment(
                baseURL: config.baseURL,
                commentId: commentID,
                userId: userID,
                accessToken: session.accessToken
            )
            pendingDeleteCommentID = nil
            showDeleteCommentAlert = false
            communityStore.incrementCommentCount(postId: postId, delta: -max(1, deletedCount))
            showSuccessToast("댓글이 삭제되었어")
            await load(forceRefresh: true)
        } catch {
            if isCancellation(error) { return }
            pendingDeleteCommentID = nil
            message = error.localizedDescription
        }
    }

    @MainActor
    private func showSuccessToast(_ text: String) {
        successToastTask?.cancel()
        withAnimation {
            successToastText = text
        }
        successToastTask = Task {
            try? await Task.sleep(nanoseconds: 1_700_000_000)
            if Task.isCancelled { return }
            await MainActor.run {
                withAnimation {
                    successToastText = nil
                }
            }
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
            viewerCanDelete: nil,
            board: BoardMetaLite(slug: boardSlug, name: boardName ?? "게시판"),
            post: PostDetail(
                id: post.id,
                title: post.title,
                content: previewContent,
                authorName: post.authorName,
                authorId: nil,
                verificationLevel: post.verificationLevel,
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
