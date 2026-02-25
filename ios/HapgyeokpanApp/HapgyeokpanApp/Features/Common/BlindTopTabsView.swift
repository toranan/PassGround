import SwiftUI

struct BlindTopTabsView: View {
    @State private var selectedTab = "최신순"
    
    var body: some View {
        HStack(spacing: 12) {
            Button(action: { selectedTab = "최신순" }) {
                HStack {
                    Image(systemName: "clock")
                        .foregroundColor(.blue)
                    Text("최신순")
                        .foregroundColor(selectedTab == "최신순" ? .primary : .gray)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(selectedTab == "최신순" ? Color.gray.opacity(0.3) : Color.clear, lineWidth: 1)
                )
            }
            
            Button(action: { selectedTab = "인기순" }) {
                HStack {
                    Image(systemName: "flame.fill")
                        .foregroundColor(.red)
                    Text("인기순")
                        .foregroundColor(selectedTab == "인기순" ? .white : .gray)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(selectedTab == "인기순" ? Color.black : Color.clear)
                )
            }
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}

#Preview {
    BlindTopTabsView()
}
