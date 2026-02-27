import SwiftUI

@main
struct HapgyeokpanApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var config = AppConfig()
    @StateObject private var session = SessionStore()
    @StateObject private var communityStore = CommunityStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(config)
                .environmentObject(session)
                .environmentObject(communityStore)
                .task {
                    await session.refreshIfNeeded(baseURL: config.baseURL)
                }
                .onChange(of: scenePhase) { newPhase in
                    guard newPhase == .active else { return }
                    Task {
                        await session.refreshIfNeeded(baseURL: config.baseURL)
                    }
                }
        }
    }
}
