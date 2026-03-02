import SwiftUI

struct BlindPostCell: View {
    let post: PostSummary
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 6) {
                Text(post.authorName.isEmpty ? "익명" : post.authorName)
                    .font(.footnote)
                    .fontWeight(.medium)

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
            
            // Body
            Text(post.title)
                .font(.body)
                .fontWeight(.bold)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            
            if let content = post.content, !content.isEmpty {
                Text(content)
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .lineLimit(2)
            }
            
            // Footer
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "heart")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(post.likeCount)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                HStack(spacing: 4) {
                    Image(systemName: "bubble.right")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("\(post.commentCount)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                HStack(spacing: 4) {
                    Image(systemName: "eye")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(formatViewCount(post.viewCount))
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                Spacer()
            }
            .padding(.top, 4)
            
            Divider()
                .padding(.top, 8)
        }
        .padding(.horizontal)
        .padding(.top, 12)
        .background(Color(UIColor.systemBackground))
    }
    
    private func formatViewCount(_ count: Int) -> String {
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}
