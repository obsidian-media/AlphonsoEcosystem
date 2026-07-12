import SwiftUI

struct ContentView: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @EnvironmentObject var mdnsService: MDNSService
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
        .onAppear {
            webSocketService.getStatus()
        }
    }
    
    private var mainContent: some View {
        TabView(selection: $selectedTab) {
            PairingView()
                .tabItem {
                    Label("Connect", systemImage: "link")
                }
                .tag(0)

            ChatView()
                .tabItem {
                    Label("Chat", systemImage: "message")
                }
                .tag(1)

            VoiceView()
                .tabItem {
                    Label("Voice", systemImage: "mic.fill")
                }
                .tag(2)

            AgentDockView()
                .tabItem {
                    Label("Agents", systemImage: "person.2")
                }
                .tag(3)

            BoardroomView()
                .tabItem {
                    Label("Boardroom", systemImage: "chart.bar")
                }
                .tag(4)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(5)
        }
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
            
            Text("Connecting to Alphonso...")
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
        .cornerRadius(10)
        .padding(.horizontal)
        .padding(.bottom, 8)
    }
}
