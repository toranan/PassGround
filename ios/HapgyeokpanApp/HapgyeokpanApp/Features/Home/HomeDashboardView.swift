import SwiftUI

struct HomeDashboardView: View {
    @EnvironmentObject private var config: AppConfig
    private let api = APIClient()
    
    @State private var exam: ExamSlug = .transfer
    @State private var briefings: [DailyBriefing] = []
    @State private var loadingBriefings = false
    
    // Grid layout for quick action cards
    let columns = [
        GridItem(.flexible(), spacing: DesignSystem.spacing),
        GridItem(.flexible(), spacing: DesignSystem.spacing)
    ]
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // 1. User Greeting
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("회원님,")
                            .font(.title2)
                        Text("오늘도 목표를 향해 달려볼까요?")
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                    Spacer()
                    
                    Image(systemName: "bell")
                        .font(.title2)
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, DesignSystem.padding)
                .padding(.top, 10)
                
                // 2. Quick Action Cards (Toss Style Grid)
                LazyVGrid(columns: columns, spacing: DesignSystem.spacing) {
                    ActionCard(
                        title: "타이머",
                        subtitle: "학습량 측정",
                        icon: "timer",
                        color: Color.blue
                    ) {
                        EmptyView() // Navigation handled in ContentView or via NavigationLink if inside NavigationStack
                    }
                    
                    ActionCard(
                        title: "합격 시뮬레이터",
                        subtitle: "내 점수 예측",
                        icon: "target",
                        color: Color.purple
                    ) {
                        EmptyView()
                    }
                    
                    ActionCard(
                        title: "합격증 인증",
                        subtitle: "경험 공유",
                        icon: "checkmark.seal.fill",
                        color: Color.green
                    ) {
                        EmptyView()
                    }
                    
                    ActionCard(
                        title: "마이페이지",
                        subtitle: "포인트 및 설정",
                        icon: "person.crop.circle.fill",
                        color: Color.gray
                    ) {
                        EmptyView()
                    }
                }
                .padding(.horizontal, DesignSystem.padding)
                
                // 3. Daily Briefing Horizontal Scroll
                VStack(alignment: .leading, spacing: DesignSystem.spacing) {
                    HStack {
                        Text("오늘의 정보")
                            .font(.headline)
                        Spacer()
                    }
                    .padding(.horizontal, DesignSystem.padding)
                    
                    if loadingBriefings {
                        ProgressView()
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding()
                    } else if briefings.isEmpty {
                        Text("오늘의 브리핑이 없습니다.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding()
                            .background(DesignSystem.cardBackground)
                            .cornerRadius(DesignSystem.cardCornerRadius)
                            .padding(.horizontal, DesignSystem.padding)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: DesignSystem.spacing) {
                                ForEach(briefings) { briefing in
                                    BriefingCard(briefing: briefing)
                                }
                            }
                            .padding(.horizontal, DesignSystem.padding)
                        }
                    }
                }
                .padding(.top, 10)
                
                Spacer(minLength: 40)
            }
            .padding(.vertical, 10)
        }
        .background(DesignSystem.background)
        .navigationTitle("")
        .navigationBarHidden(true)
        .task {
            await loadBriefings()
        }
        .refreshable {
            await loadBriefings()
        }
    }
    
    private func loadBriefings() async {
        loadingBriefings = true
        do {
            let response = try await api.fetchBriefings(baseURL: config.baseURL, exam: exam)
            briefings = response.briefings
        } catch {
            print("Failed to fetch briefings: \\(error)")
        }
        loadingBriefings = false
    }
}

// MARK: - Subcomponents
struct ActionCard<Destination: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let destination: () -> Destination
    
    var body: some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon)
                        .font(.title2)
                        .foregroundColor(color)
                    Spacer()
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(DesignSystem.padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DesignSystem.cardBackground)
            .cornerRadius(DesignSystem.cardCornerRadius)
            .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
    }
}

struct BriefingCard: View {
    let briefing: DailyBriefing
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(briefing.title)
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundColor(.primary)
                .lineLimit(2)
            
            Text(briefing.summary)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(3)
            
            Spacer()
            
            Text("\\(briefing.sourceLabel) · \\(briefing.publishedAt)")
                .font(.caption2)
                .foregroundColor(.gray)
        }
        .padding(DesignSystem.padding)
        .frame(width: 240, height: 140, alignment: .topLeading)
        .background(DesignSystem.cardBackground)
        .cornerRadius(DesignSystem.cardCornerRadius)
        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 4)
    }
}
