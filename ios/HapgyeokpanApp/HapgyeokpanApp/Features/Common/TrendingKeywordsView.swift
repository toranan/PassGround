import SwiftUI

struct TrendingKeywordsView: View {
    let keywords = ["당근", "부산", "부동산", "진급", "대전", "하이닉스", "돌싱", "테슬라", "삼성전자", "승격"]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .foregroundColor(.red)
                Text("트렌딩 키워드")
                    .font(.headline)
            }
            .padding(.horizontal)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(keywords, id: \.self) { keyword in
                        Text(keyword)
                            .font(.subheadline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(UIColor.systemGray6))
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }
}

#Preview {
    TrendingKeywordsView()
}
