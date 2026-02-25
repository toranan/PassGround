import SwiftUI

private let webPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

struct BoardPostsView: View {
    @EnvironmentObject private var config: AppConfig

    private let api = APIClient()

    let exam: ExamSlug
    let board: BoardInfo
    let writable: Bool

    @State private var posts: [PostSummary] = []
    @State private var loading = false
    @State private var errorMessage = ""
    @State private var showComposer = false
    @State private var searchText = ""

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

                    if loading {
                        VStack {
                            ProgressView("게시글 로딩 중...")
                                .padding(.vertical, 40)
                        }
                        .frame(maxWidth: .infinity)
                        .background(Color.white)
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
                                    PostDetailView(exam: exam, boardSlug: board.slug, postId: post.id)
                                } label: {
                                    BlindCommunityPostCell(post: post)
                                }
                                .buttonStyle(.plain)

                                Divider()
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
                await loadPosts()
            }
            .refreshable {
                await loadPosts()
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
        .sheet(isPresented: $showComposer) {
            NavigationStack {
                PostComposerView(exam: exam, boardSlug: board.slug)
            }
        }
    }

    private func loadPosts() async {
        loading = true
        errorMessage = ""
        do {
            let response = try await api.fetchPosts(baseURL: config.baseURL, exam: exam, board: board.slug)
            posts = response.posts
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - BlindCommunityPostCell
struct BlindCommunityPostCell: View {
    let post: PostSummary
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header: Author Info
            HStack(spacing: 8) {
                // Profile Circular Image Placeholder
                Circle()
                    .fill(Color(UIColor.systemGray5))
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                    )
                
                HStack(spacing: 6) {
                    Text(post.authorName.isEmpty ? "익명" : post.authorName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                    
                    Text(post.timeLabel.isEmpty ? "방금 전" : post.timeLabel)
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    Text("·")
                        .font(.caption)
                        .foregroundColor(.gray)
                    
                    Text("언팔로우")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                }
                
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
