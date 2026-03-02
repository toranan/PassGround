import SwiftUI

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
