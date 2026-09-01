import SwiftUI

/// Selects the mobile experience. Atlas (the cloud-first shell) is opt-in preview only —
/// it talks to a non-production demo control plane, not the user's running desktop app.
/// The legacy local companion (real WebSocket pairing to the desktop app) stays default
/// until Atlas is wired to real desktop/task execution instead of the demo backend.
struct ContentView: View {
    @AppStorage("alphonso.mobile.experience") private var experience = MobileExperience.legacy.rawValue

    var body: some View {
        if selectedExperience == .atlas {
            AtlasMobileRoot {
                experience = MobileExperience.legacy.rawValue
            }
        } else {
            LegacyCompanionContent {
                experience = MobileExperience.atlas.rawValue
            }
        }
    }

    private var selectedExperience: MobileExperience {
        MobileExperience(rawValue: experience) ?? .legacy
    }
}

private enum MobileExperience: String {
    case atlas
    case legacy
}

/// The pre-existing local companion is preserved intact behind the migration seam.
private struct LegacyCompanionContent: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @EnvironmentObject var mdnsService: MDNSService
    let returnToAtlas: () -> Void
    @State private var selectedTab = 0

    var body: some View {
        ZStack {
            if webSocketService.connectionState == .connecting {
                LoadingView()
            } else {
                mainContent
            }

            if let error = webSocketService.errorMessage,
               webSocketService.connectionState != .connecting {
                VStack {
                    Spacer()
                    ErrorBanner(message: error) {
                        webSocketService.errorMessage = nil
                    }
                }
            }
        }
        .safeAreaInset(edge: .top) {
            LegacyMigrationBanner(returnToAtlas: returnToAtlas)
        }
        .onAppear {
            webSocketService.getStatus()
        }
        .onChange(of: webSocketService.connectionState) { _, newValue in
            if newValue == .authenticated {
                selectedTab = 0
            } else if newValue == .disconnected {
                selectedTab = 1
            }
        }
    }

    private var mainContent: some View {
        TabView(selection: $selectedTab) {
            OperationsView()
                .tabItem {
                    Label("Operations", systemImage: "bolt.horizontal")
                }
                .tag(0)

            PairingView()
                .tabItem {
                    Label("Connect", systemImage: "link")
                }
                .tag(1)

            ChatView()
                .tabItem {
                    Label("Chat", systemImage: "message")
                }
                .tag(2)

            VoiceView()
                .tabItem {
                    Label("Voice", systemImage: "mic.fill")
                }
                .tag(3)

            AgentDockView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Agents", systemImage: "person.2")
                }
                .tag(4)

            BoardroomView()
                .tabItem {
                    Label("Boardroom", systemImage: "chart.bar")
                }
                .tag(5)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(6)
        }
    }
}

private struct LegacyMigrationBanner: View {
    let returnToAtlas: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.triangle.branch")
                .foregroundStyle(AtlasTheme.ColorToken.moss)
            Text("Legacy local companion")
                .font(.caption.weight(.semibold))
            Spacer()
            Button("Return to Atlas", action: returnToAtlas)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(AtlasTheme.ColorToken.mineral)
        .overlay(alignment: .bottom) {
            AtlasRule()
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Returns to the new full-mobile Alphonso experience")
    }
}

struct LoadingView: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 48))
                .foregroundStyle(.blue)
                .rotationEffect(.degrees(isAnimating ? 15 : -15))
                .animation(
                    .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                    value: isAnimating
                )

            Text("Connecting to Alphonso…")
                .font(.headline)
                .foregroundStyle(.secondary)

            ProgressView()
        }
        .onAppear {
            isAnimating = true
        }
    }
}

struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.yellow)
            Text(message)
                .font(.caption)
                .foregroundColor(.white)
            Spacer()
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal)
        .padding(.bottom, 8)
    }
}
