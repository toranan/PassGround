import SwiftUI

struct BlindPostCell: View {
    let post: PostSummary
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 24, height: 24)
                    .overlay(
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.gray)
                    )
                
                Text(post.authorName.isEmpty ? "익명" : post.authorName)
                    .font(.footnote)
                    .fontWeight(.medium)
                
                Text(post.timeLabel.isEmpty ? "방금 전" : post.timeLabel)
                    .font(.caption)
                    .foregroundColor(.gray)
                
                Spacer()
                
                Text("언팔로우")
                    .font(.caption)
                    .foregroundColor(.gray)
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
