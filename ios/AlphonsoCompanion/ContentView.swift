import SwiftUI

struct ContentView: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @State private var selectedTab = 0

    var body: some View {
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

            AgentDockView()
                .tabItem {
                    Label("Agents", systemImage: "person.2")
                }
                .tag(2)

            BoardroomView()
                .tabItem {
                    Label("Boardroom", systemImage: "chart.bar")
                }
                .tag(3)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(4)
        }
        .onAppear {
            webSocketService.getStatus()
        }
    }
}