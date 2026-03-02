import SwiftUI

private let webPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

struct BoardPostsView: View {
    @EnvironmentObject private var config: AppConfig
    @EnvironmentObject private var communityStore: CommunityStore
    @EnvironmentObject private var session: SessionStore
    @Environment(\.scenePhase) private var scenePhase

    private let api = APIClient()

    let exam: ExamSlug
    let board: BoardInfo
    let writable: Bool

    @State private var posts: [PostSummary] = []
    @State private var loading = false
    @State private var loadingMore = false
    @State private var errorMessage = ""
    @State private var showComposer = false
    @State private var searchText = ""
    @State private var nextCursor: String?
    @State private var hasMore = true
    @State private var didBootstrap = false
    @State private var lastAutoRefreshAt = Date.distantPast
    @State private var prefetchedPostIDs: Set<String> = []
    @State private var loadRevision = 0
    private let pageSize = 20

    private var filteredPosts: [PostSummary] {
        let token = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.isEmpty { return posts }
        return posts.filter { $0.title.localizedCaseInsensitiveContains(token) }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(board.name)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Text(board.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            TextField("제목 검색", text: $searchText)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled(true)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                        )

                        if !writable {
                            Text("읽기 전용")
                                .font(.caption2)
                                .foregroundStyle(.gray)
                        }
                        if !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                    .padding(16)
                    .background(Color.white)

                    Divider()

                    if loading && posts.isEmpty {
                        skeletonList
                    } else if filteredPosts.isEmpty {
                        Text(searchText.isEmpty ? "아직 게시글이 없습니다." : "검색 결과가 없습니다.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                            .background(Color.white)
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(filteredPosts) { post in
                                NavigationLink {
                                    PostDetailView(
                                        exam: exam,
                                        boardSlug: board.slug,
                                        postId: post.id,
                                        initialPost: post,
                                        boardName: board.name
                                    )
                                } label: {
                                    BlindCommunityPostCell(post: post)
                                }
                                .buttonStyle(.plain)
                                .onAppear {
                                    guard searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                                    let rowIndex = posts.firstIndex(where: { $0.id == post.id }) ?? Int.max
                                    if rowIndex < 6 {
                                        Task { await prefetchPostDetail(postId: post.id) }
                                    }
                                    guard let lastID = posts.last?.id, lastID == post.id else { return }
                                    Task { await loadPosts(reset: false) }
                                }

                                Divider()
                            }

                            if loadingMore {
                                HStack {
                                    Spacer()
                                    ProgressView("더 불러오는 중...")
                                        .font(.caption)
                                        .padding(.vertical, 12)
                                    Spacer()
                                }
                                .background(Color.white)
                            }
                        }
                    }
                }
                .background(Color.white)
            }
            .background(Color.white)
            .navigationTitle(board.name)
            .navigationBarTitleDisplayMode(.inline)
            .task {
                guard !didBootstrap else { return }
                didBootstrap = true
                let fresh = applyCachedSnapshotIfAvailable()
                if !fresh {
                    await loadPosts(reset: true)
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
                await loadPosts(reset: true, forceRefresh: true)
            }

            if writable {
                Button {
                    showComposer = true
                } label: {
                    Label("글쓰기", systemImage: "square.and.pencil")
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(webPrimary, in: Capsule())
                }
                .padding(.trailing, 18)
                .padding(.bottom, 20)
                .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 4)
            }
        }
        .sheet(isPresented: $showComposer, onDismiss: {
            Task { await loadPosts(reset: true, forceRefresh: true) }
        }) {
            NavigationStack {
                PostComposerView(exam: exam, boardSlug: board.slug)
            }
        }
    }

    private var skeletonList: some View {
        VStack(spacing: 0) {
            ForEach(0..<6, id: \.self) { index in
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.18))
                        .frame(height: 18)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.14))
                        .frame(height: 14)
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.12))
                            .frame(width: 40, height: 12)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.12))
                            .frame(width: 54, height: 12)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.12))
                            .frame(width: 54, height: 12)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)

                if index < 5 {
                    Divider()
                }
            }
        }
        .background(Color.white)
    }

    @discardableResult
    private func applyCachedSnapshotIfAvailable() -> Bool {
        guard let snapshot = communityStore.postsSnapshot(exam: exam, board: board.slug) else {
            return false
        }
        posts = snapshot.posts
        nextCursor = snapshot.nextCursor
        hasMore = snapshot.hasMore
        errorMessage = ""
        let age = Date().timeIntervalSince(snapshot.updatedAt)
        return age <= CommunityStore.freshWindow
    }

    private func loadPosts(reset: Bool, forceRefresh: Bool = false) async {
        if reset {
            if loading && !forceRefresh { return }
            loading = true
            errorMessage = ""
        } else {
            if loading || loadingMore || !hasMore { return }
            loadingMore = true
        }

        loadRevision += 1
        let requestRevision = loadRevision
        defer {
            if reset {
                loading = false
            } else {
                loadingMore = false
            }
        }

        let cachePolicy: URLRequest.CachePolicy = forceRefresh ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
        let cursor = reset ? nil : nextCursor
        let cacheBust = forceRefresh ? String(Int(Date().timeIntervalSince1970 * 1000)) : nil

        do {
            let response = try await api.fetchPosts(
                baseURL: config.baseURL,
                exam: exam,
                board: board.slug,
                limit: pageSize,
                cursor: cursor,
                cacheBust: cacheBust,
                cachePolicy: cachePolicy
            )
            guard requestRevision == loadRevision else { return }
            let resolvedPosts = communityStore.mergeLikeOverrides(posts: response.posts)

            if reset {
                posts = resolvedPosts
            } else {
                var seen = Set(posts.map(\.id))
                let appended = resolvedPosts.filter { seen.insert($0.id).inserted }
                posts.append(contentsOf: appended)
            }

            nextCursor = response.nextCursor
            hasMore = response.hasMore ?? (response.nextCursor?.isEmpty == false)
            communityStore.savePostsSnapshot(
                exam: exam,
                board: board.slug,
                posts: posts,
                nextCursor: nextCursor,
                hasMore: hasMore
            )
        } catch {
            if isCancellation(error) {
                return
            }
            guard requestRevision == loadRevision else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func refreshIfStale() {
        let fresh = applyCachedSnapshotIfAvailable()
        guard !fresh else { return }
        guard !loading else { return }
        let now = Date()
        guard now.timeIntervalSince(lastAutoRefreshAt) > 8 else { return }
        lastAutoRefreshAt = now
        Task { await loadPosts(reset: true) }
    }

    private func prefetchPostDetail(postId: String) async {
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
                board: board.slug,
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

    private func isCancellation(_ error: Error) -> Bool {
        APIClient.isCancellationError(error)
    }
}

// MARK: - BlindCommunityPostCell
struct BlindCommunityPostCell: View {
    let post: PostSummary
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header: Author Info
            HStack(spacing: 6) {
                Text(post.authorName.isEmpty ? "익명" : post.authorName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)

                if let badge = post.verificationLevel, badge != "none", !badge.isEmpty {
                    Text(badge)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.14), in: Capsule())
                }

                Text(post.timeLabel.isEmpty ? "방금 전" : post.timeLabel)
                    .font(.caption)
                    .foregroundColor(.gray)

                Spacer()
            }
            
            // Body: Title and Snippet
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(post.title)
                        .font(.body)
                        .fontWeight(.bold)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .foregroundColor(.primary)
                    
                    if let content = post.content, !content.isEmpty {
                        Text(content)
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                
                Spacer(minLength: 0)
            }
            
            // Footer: Stats
            HStack(spacing: 16) {
                StatView(icon: "heart", count: post.likeCount)
                StatView(icon: "bubble.right", count: post.commentCount)
                StatView(icon: "eye", count: formatViewCount(post.viewCount))
                Spacer()
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(Color.white)
    }
    
    // Helper view for stats
    private struct StatView: View {
        let icon: String
        let count: String
        
        init(icon: String, count: Int) {
            self.icon = icon
            self.count = "\(count)"
        }
        
        init(icon: String, count: String) {
            self.icon = icon
            self.count = count
        }
        
        var body: some View {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                Text(count)
                    .font(.caption)
            }
            .foregroundColor(.gray)
        }
    }
    
    private func formatViewCount(_ count: Int) -> String {
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}
