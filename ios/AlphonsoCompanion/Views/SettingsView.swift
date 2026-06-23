import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(webSocketService.connectionState.rawValue.capitalized)
                            .foregroundStyle(.secondary)
                    }

                    if let error = webSocketService.errorMessage {
                        Text("Error: \(error)")
                            .foregroundColor(.red)
                    }

                    Button("Disconnect") {
                        webSocketService.disconnect()
                    }
                    .disabled(webSocketService.connectionState == .disconnected)
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("2.0.8")
                            .foregroundStyle(.secondary)
                    }

                    Link("GitHub", destination: URL(string: "https://github.com/phonon-ai/alphonso")!)
                }
            }
            .navigationTitle("Settings")
        }
    }
}