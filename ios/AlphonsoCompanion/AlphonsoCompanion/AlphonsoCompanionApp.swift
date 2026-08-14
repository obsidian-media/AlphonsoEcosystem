import SwiftUI

@main
struct AlphonsoCompanionApp: App {
    @StateObject private var webSocketService = WebSocketService()
    @StateObject private var mdnsService = MDNSService()
    @StateObject private var voiceCloudService = VoiceCloudService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(webSocketService)
                .environmentObject(mdnsService)
                .environmentObject(voiceCloudService)
                .onOpenURL { url in
                    Task { try? await voiceCloudService.completeMagicLink(url) }
                }
        }
    }
}
