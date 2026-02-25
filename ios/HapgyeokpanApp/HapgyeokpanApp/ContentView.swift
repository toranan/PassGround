import SwiftUI

private let webPrimary = Color(red: 79/255, green: 70/255, blue: 229/255)

enum DesignSystem {
    static let primary = Color(red: 79/255, green: 70/255, blue: 229/255)
    static let background = Color(UIColor.systemGroupedBackground)
    static let cardBackground = Color.white
    static let cardCornerRadius: CGFloat = 16
    static let padding: CGFloat = 16
    static let spacing: CGFloat = 12
}

struct ContentView: View {
    @State private var selectedTab: TabSelection = .home

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selectedTab {
                case .home:
                    NavigationStack {
                        TransferHomeView()
                    }
                case .community:
                    NavigationStack {
                        CommunityBoardsView()
                    }
                case .ranking:
                    NavigationStack {
                        RankingView()
                    }
                case .verification:
                    NavigationStack {
                        VerificationView()
                    }
                case .mypage:
                    NavigationStack {
                        MyPageView()
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            MainBottomTabBar(selectedTab: $selectedTab)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

enum TabSelection: String {
    case home = "홈"
    case community = "커뮤니티"
    case ranking = "랭킹"
    case verification = "인증"
    case mypage = "마이"
}

struct MainBottomTabBar: View {
    @Binding var selectedTab: TabSelection

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack {
                TabBarButton(title: "홈", iconName: "house.fill", tab: .home, selectedTab: $selectedTab)
                TabBarButton(title: "커뮤니티", iconName: "text.bubble.fill", tab: .community, selectedTab: $selectedTab)
                TabBarButton(title: "랭킹", iconName: "chart.bar.fill", tab: .ranking, selectedTab: $selectedTab)
                TabBarButton(title: "인증", iconName: "checkmark.seal.fill", tab: .verification, selectedTab: $selectedTab)
                TabBarButton(title: "마이", iconName: "person.crop.circle.fill", tab: .mypage, selectedTab: $selectedTab)
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(Color(UIColor.systemBackground))
        }
    }
}

struct TabBarButton: View {
    let title: String
    let iconName: String
    let tab: TabSelection
    @Binding var selectedTab: TabSelection

    var body: some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: iconName)
                    .font(.system(size: 20))
                    .foregroundColor(selectedTab == tab ? webPrimary : .gray)
                Text(title)
                    .font(.system(size: 10))
                    .foregroundColor(selectedTab == tab ? webPrimary : .gray)
            }
            .frame(maxWidth: .infinity)
        }
    }
}
