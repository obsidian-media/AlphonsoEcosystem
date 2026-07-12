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
                HostListView(
                    hosts: mdnsService.discovered,
                    selectedHost: $selectedHost
                )

                Button("Enter IP Manually") {
                    selectedHost = nil
                    showingManualEntry = true
                }
                .foregroundColor(.accentColor)
                .padding(.horizontal)
                .padding(.top, 8)

                if !webSocketService.recentEndpoints.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recent connections")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(webSocketService.recentEndpoints) { endpoint in
                                    Button {
                                        selectedHost = nil
                                        manualHost = endpoint.host
                                        manualPort = "\(endpoint.port)"
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(endpoint.displayName)
                                                .font(.subheadline.weight(.semibold))
                                            Text("\(endpoint.host):\(endpoint.port)")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 10)
                                        .frame(minWidth: 140, alignment: .leading)
                                        .background(.thinMaterial)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.bottom, 8)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("PIN Code")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TextField("6-digit PIN from desktop", text: $pin)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("pairing-pin-field")
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
                    .accessibilityIdentifier("pairing-connect-button")
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
                }

                if let hint = webSocketService.connectionHint {
                    Text(hint)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
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

    private var canConnect: Bool {
        pin.count == 6 && (selectedHost != nil || !manualHost.isEmpty)
    }

    private func connect() {
        let pin = self.pin

        if let selected = selectedHost {
            // Resolve the mDNS service endpoint to a real IP before connecting
            mdnsService.resolveHost(selected) { resolvedHost, resolvedPort in
                self.webSocketService.connect(
                    host: resolvedHost,
                    port: resolvedPort,
                    pin: pin,
                    displayName: selected.name,
                    source: "bonjour"
                )
            }
        } else {
            let host = manualHost
            let port = UInt16(manualPort) ?? 8765
            webSocketService.connect(
                host: host,
                port: port,
                pin: pin,
                displayName: host,
                source: "manual"
            )
        }
    }
}

struct HostListView: View {
    let hosts: [DiscoveredHost]
    @Binding var selectedHost: DiscoveredHost?

    var body: some View {
        if hosts.isEmpty {
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
                    ForEach(hosts) { host in
                        HostRow(host: host, isSelected: selectedHost?.id == host.id)
                            .onTapGesture { selectedHost = host }
                    }
                }
            }
        }
    }
}

struct HostRow: View {
    let host: DiscoveredHost
    let isSelected: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(host.name)
                    .font(.headline)
                Text("\(host.host):\(host.port)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundColor(.accentColor)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .foregroundColor(.primary)
    }
}
