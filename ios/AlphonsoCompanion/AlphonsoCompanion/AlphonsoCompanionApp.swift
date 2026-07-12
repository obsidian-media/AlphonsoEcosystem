import SwiftUI

@main
struct AlphonsoCompanionApp: App {
    @StateObject private var webSocketService = WebSocketService()
    @StateObject private var mdnsService = MDNSService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(webSocketService)
                .environmentObject(mdnsService)
        }
    }
}
