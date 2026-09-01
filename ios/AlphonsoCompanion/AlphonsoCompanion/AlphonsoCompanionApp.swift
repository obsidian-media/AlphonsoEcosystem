import SwiftUI

@main
struct AlphonsoCompanionApp: App {
    @StateObject private var webSocketService = WebSocketService()
    @StateObject private var mdnsService = MDNSService()
    @StateObject private var voiceCloudService: VoiceCloudService
    @StateObject private var atlasIdentityService: AtlasIdentityService

    init() {
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            UserDefaults.standard.set("atlas", forKey: "alphonso.mobile.experience")
        }
        let voiceCloud = VoiceCloudService()
        _voiceCloudService = StateObject(wrappedValue: voiceCloud)
        _atlasIdentityService = StateObject(wrappedValue: AtlasIdentityService(voiceCloudService: voiceCloud))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(webSocketService)
                .environmentObject(mdnsService)
                .environmentObject(voiceCloudService)
                .environmentObject(atlasIdentityService)
                .onOpenURL { url in
                    Task { await atlasIdentityService.handleSignInCallback(url) }
                }
        }
    }
}
