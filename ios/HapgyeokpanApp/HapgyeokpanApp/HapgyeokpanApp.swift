import SwiftUI

@main
struct HapgyeokpanApp: App {
    @StateObject private var config = AppConfig()
    @StateObject private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(config)
                .environmentObject(session)
        }
    }
}
