import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var webSocketService: WebSocketService
    @EnvironmentObject var mdnsService: MDNSService
    
    @State private var showReconnectSheet = false
    @State private var reconnectHost = ""
    @State private var reconnectPort = "8765"
    @State private var reconnectPin = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    HStack {
                        Text("Status")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(webSocketService.connectionState.rawValue.capitalized)
                        }
                        .foregroundStyle(.secondary)
                    }

                    if let error = webSocketService.errorMessage {
                        Text("Error: \(error)")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    
                    if webSocketService.connectionState == .disconnected ||
                       webSocketService.connectionState == .failed {
                        Button {
                            showReconnectSheet = true
                        } label: {
                            Label("Reconnect", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }

                    if webSocketService.connectionState == .connecting ||
                       webSocketService.connectionState == .failed {
                        Button {
                            webSocketService.pauseReconnects()
                        } label: {
                            Label("Stop reconnecting", systemImage: "pause.circle")
                        }
                    }

                    Button("Disconnect") {
                        webSocketService.disconnect()
                    }
                    .disabled(webSocketService.connectionState == .disconnected)
                }
                
                Section("Streaming") {
                    HStack {
                        Text("Active")
                        Spacer()
                        Text(webSocketService.isStreaming ? "Yes" : "No")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Messages")
                        Spacer()
                        Text("\(webSocketService.messages.count)")
                            .foregroundStyle(.secondary)
                    }
                    if let lastMessageReceivedAt = webSocketService.lastMessageReceivedAt {
                        HStack {
                            Text("Last message")
                            Spacer()
                            Text(lastMessageReceivedAt, style: .relative)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let lastBoardroomRefreshAt = webSocketService.lastBoardroomRefreshAt {
                        HStack {
                            Text("Boardroom refresh")
                            Spacer()
                            Text(lastBoardroomRefreshAt, style: .relative)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Diagnostics") {
                    if let lastSuccessfulConnectionAt = webSocketService.lastSuccessfulConnectionAt {
                        HStack {
                            Text("Last connected")
                            Spacer()
                            Text(lastSuccessfulConnectionAt, style: .relative)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let hint = webSocketService.connectionHint {
                        Text(hint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.6.0")
                            .foregroundStyle(.secondary)
                    }
                    
                    HStack {
                        Text("Build")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                            .foregroundStyle(.secondary)
                    }

                    Link("GitHub", destination: URL(string: "https://github.com/phonon-ai/alphonso")!)
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showReconnectSheet) {
                ReconnectSheet(
                    host: $reconnectHost,
                    port: $reconnectPort,
                    pin: $reconnectPin,
                    onConnect: { endpoint, pin in
                        webSocketService.connect(host: endpoint.host, port: endpoint.port, pin: pin, displayName: endpoint.host, source: "manual")
                        showReconnectSheet = false
                    },
                    onCancel: {
                        showReconnectSheet = false
                    }
                )
            }
        }
    }
    
    private var statusColor: Color {
        switch webSocketService.connectionState {
        case .authenticated, .connected:
            return .green
        case .connecting:
            return .yellow
        case .failed:
            return .red
        case .disconnected:
            return .gray
        }
    }
}

struct ReconnectSheet: View {
    @Binding var host: String
    @Binding var port: String
    @Binding var pin: String
    let onConnect: (PairingEndpoint, String) -> Void
    let onCancel: () -> Void
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Desktop Address") {
                    TextField("Host (e.g. 192.168.1.100)", text: $host)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                    TextField("Port", text: $port)
                        .keyboardType(.numberPad)
                }
                
                Section("Authentication") {
                    TextField("6-digit PIN", text: $pin)
                        .keyboardType(.numberPad)
                        .onChange(of: pin) { _, newValue in
                            pin = String(newValue.filter(\.isNumber).prefix(6))
                        }
                }
            }
            .navigationTitle("Reconnect")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onCancel() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Connect") {
                        if let endpoint = PairingEndpoint(host: host, portText: port) {
                            onConnect(endpoint, pin)
                        }
                    }
                    .disabled(PairingEndpoint(host: host, portText: port) == nil || pin.count != 6)
                }
            }
        }
    }
}
