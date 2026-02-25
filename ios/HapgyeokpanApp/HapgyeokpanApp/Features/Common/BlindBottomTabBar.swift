import SwiftUI

enum TabSelection: String {
    case home = "홈"
    case company = "회사"
    case channel = "채널"
    case jobs = "채용"
    case notifications = "알림"
    case write = "글쓰기"
}

struct BlindBottomTabBar: View {
    @Binding var selectedTab: TabSelection

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack {
                TabBarButton(title: "홈", iconName: "house.fill", tab: .home, selectedTab: $selectedTab)
                TabBarButton(title: "회사", iconName: "building.2", tab: .company, selectedTab: $selectedTab)
                TabBarButton(title: "채널", iconName: "rectangle.3.group", tab: .channel, selectedTab: $selectedTab)
                TabBarButton(title: "채용", iconName: "briefcase", tab: .jobs, selectedTab: $selectedTab)
                TabBarButton(title: "알림", iconName: "bell", tab: .notifications, selectedTab: $selectedTab)
                TabBarButton(title: "글쓰기", iconName: "plus.square.fill", tab: .write, selectedTab: $selectedTab, tintColor: .red)
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)
            .padding(.bottom, 8) // SafeArea bottom is handled natively by the context usually, but add a bit of padding.
            .background(Color(UIColor.systemBackground))
        }
    }
}

struct TabBarButton: View {
    let title: String
    let iconName: String
    let tab: TabSelection
    @Binding var selectedTab: TabSelection
    var tintColor: Color = .primary

    var body: some View {
        Button(action: {
            selectedTab = tab
        }) {
            VStack(spacing: 4) {
                Image(systemName: iconName)
                    .font(.system(size: 20))
                    .foregroundColor(selectedTab == tab ? tintColor : .gray)
                Text(title)
                    .font(.system(size: 10))
                    .foregroundColor(selectedTab == tab ? tintColor : .gray)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

#Preview {
    BlindBottomTabBar(selectedTab: .constant(.home))
}
