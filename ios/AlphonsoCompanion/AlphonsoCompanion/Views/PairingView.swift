import SwiftUI

struct PairingView: View {
    @EnvironmentObject var mdnsService: MDNSService
    @EnvironmentObject var webSocketService: WebSocketService

    @State private var pin = ""
    @State private var selectedHost: DiscoveredHost?
    @State private var showingManualEntry = false
    @State private var manualHost = ""
    @State private var manualPort = "8765"

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                discoveredSection

                VStack(alignment: .leading, spacing: 12) {
                    Text("PIN Code")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TextField("6-digit PIN from desktop", text: $pin)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: pin) { _, newValue in
                            let filtered = newValue.filter { $0.isNumber }
                            if filtered.count > 6 {
                                pin = String(filtered.prefix(6))
                            } else {
                                pin = filtered
                            }
                        }

                    Button(action: connect) {
                        HStack {
                            Spacer()
                            if webSocketService.connectionState == .connecting {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .scaleEffect(0.8)
                            } else {
                                Text("Connect")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                        .padding()
                        .background(
                            canConnect ? Color.accentColor : Color.secondary.opacity(0.3)
                        )
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(!canConnect)
                    .buttonStyle(.plain)
                }
                .padding()
                .background(.regularMaterial)

                if let error = webSocketService.errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                        .padding(.horizontal)
                        .padding(.bottom, 8)
                }
            }
            .navigationTitle("Connect to Desktop")
            .onAppear {
                mdnsService.startBrowsing()
            }
            .onDisappear {
                mdnsService.stopBrowsing()
            }
            .sheet(isPresented: $showingManualEntry) {
                NavigationStack {
                    Form {
                        Section("Desktop Address") {
                            TextField("IP Address (e.g. 192.168.1.100)", text: $manualHost)
                                .keyboardType(.decimalPad)
                            TextField("Port", text: $manualPort)
                            .keyboardType(.numberPad)
                        }
                    }
                    .navigationTitle("Manual Connection")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") {
                                showingManualEntry = false
                            }
                        }
                    }
                }
            }
        }
    }

    private var discoveredSection: some View {
        Group {
            if mdnsService.discovered.isEmpty {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Scanning for Alphonso Desktop...")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
                .padding(.horizontal)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(mdnsService.discovered) { host in
                            Button(action: { selectedHost = host }) {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(host.name)
                                            .font(.headline)
                                        Text("\(host.host):\(host.port)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if selectedHost?.id == host.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.accent)
                                    }
                                }
                                .padding(.horizontal)
                                .padding(.vertical, 10)
                            }
                            .foregroundColor(.primary)
                        }
                    }
                }
            }

            Button("Enter IP Manually") {
                showingManualEntry = true
            }
            .foregroundColor(.accent)
            .padding(.horizontal)
            .padding(.top, 8)
        }
    }

    private var canConnect: Bool {
        pin.count == 6 && (selectedHost != nil || !manualHost.isEmpty)
    }

    private func connect() {
        let host: String
        let port: UInt16

        if let selected = selectedHost {
            host = selected.host
            port = selected.port
        } else {
            host = manualHost
            port = UInt16(manualPort) ?? 8765
        }

        webSocketService.connect(host: host, port: port, pin: pin)
    }
}
