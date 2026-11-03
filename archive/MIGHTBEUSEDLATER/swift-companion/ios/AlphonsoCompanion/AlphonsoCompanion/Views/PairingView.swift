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
            CompanionPage {
                PairingHero(
                    state: webSocketService.connectionState,
                    selectedTarget: selectedTarget
                )
                CompanionRule()

                CompanionSectionHeader("Find your desktop", detail: "Bonjour discovery stays local to your network.")

                HostListView(
                    hosts: mdnsService.discovered,
                    selectedHost: $selectedHost
                )

                CompanionActionButton("Enter desktop address") {
                    selectedHost = nil
                    showingManualEntry = true
                }

                if !webSocketService.recentEndpoints.isEmpty {
                    CompanionSectionHeader("Recent desktops")
                    ForEach(webSocketService.recentEndpoints) { endpoint in
                        Button {
                            selectedHost = nil
                            manualHost = endpoint.host
                            manualPort = "\(endpoint.port)"
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(endpoint.displayName).font(CompanionTheme.title)
                                    Text("\(endpoint.host):\(endpoint.port)")
                                        .font(CompanionTheme.caption)
                                        .foregroundStyle(CompanionTheme.mutedInk)
                                }
                                Spacer()
                                if manualEndpoint?.host == endpoint.host && manualEndpoint?.port == endpoint.port {
                                    Image(systemName: "checkmark").foregroundStyle(CompanionTheme.accent)
                                }
                            }
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                        CompanionRule()
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    CompanionSectionHeader("Authenticate", detail: "Use the six-digit, one-time PIN shown by Alphonso Desktop.")

                    TextField("6-digit PIN from desktop", text: $pin)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("pairing-pin-field")
                        .onChange(of: pin) { _, newValue in
                            pin = PairingInput.pin(from: newValue)
                        }

                    Text(pairingInstruction)
                        .font(CompanionTheme.caption)
                        .foregroundStyle(CompanionTheme.mutedInk)

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
                        .padding(.vertical, 14)
                        .background(canConnect ? CompanionTheme.accent : CompanionTheme.rule)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .accessibilityIdentifier("pairing-connect-button")
                    .disabled(!canConnect)
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 8)

                if let error = webSocketService.errorMessage {
                    Text(error)
                        .foregroundColor(CompanionTheme.danger)
                        .font(CompanionTheme.caption)
                }

                if let hint = webSocketService.connectionHint {
                    Text(hint)
                        .font(.caption2)
                        .foregroundStyle(CompanionTheme.mutedInk)
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
        pin.count == 6 && (selectedHost != nil || manualEndpoint != nil)
    }

    private var manualEndpoint: PairingEndpoint? {
        PairingEndpoint(host: manualHost, portText: manualPort)
    }

    private var selectedTarget: String? {
        selectedHost?.name ?? manualEndpoint?.host
    }

    private var pairingInstruction: String {
        guard pin.count == 6 else { return "Enter the six-digit one-time PIN shown by Alphonso Desktop." }
        guard selectedHost != nil || manualEndpoint != nil else { return "Choose a discovered desktop or enter a valid address." }
        return "Ready to create an encrypted, authenticated desktop session."
    }

    private func connect() {
        let pin = self.pin

        if let selected = selectedHost {
            // Resolve the mDNS service endpoint to a real IP before connecting
            mdnsService.resolveHost(selected) { result in
                switch result {
                case .success(let endpoint):
                    self.webSocketService.connect(
                        host: endpoint.host,
                        port: endpoint.port,
                        pin: pin,
                        displayName: selected.name,
                        source: "bonjour"
                    )
                case .failure(let error):
                    self.webSocketService.errorMessage = "Could not resolve \(selected.name): \(error.localizedDescription)"
                    self.webSocketService.connectionHint = "Select the desktop again or enter its exact address manually."
                }
            }
        } else if let endpoint = manualEndpoint {
            webSocketService.connect(
                host: endpoint.host,
                port: endpoint.port,
                pin: pin,
                displayName: endpoint.host,
                source: "manual"
            )
        }
    }
}

private struct PairingHero: View {
    let state: ConnectionState
    let selectedTarget: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(state == .authenticated ? "Paired with desktop" : "Connect your workspace", systemImage: state == .authenticated ? "checkmark.seal.fill" : "link")
                .font(CompanionTheme.section)
                .foregroundStyle(CompanionTheme.accent)
            Text(state == .authenticated ? "Your companion is live." : "One secure pairing, then your workspace follows you.")
                .font(CompanionTheme.display)
            Text(selectedTarget.map { "Selected: \($0)" } ?? "Find Alphonso Desktop automatically or enter its address.")
                .font(CompanionTheme.body)
                .foregroundStyle(CompanionTheme.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
            LazyVStack(spacing: 0) {
                ForEach(hosts) { host in
                    HostRow(host: host, isSelected: selectedHost?.id == host.id)
                        .onTapGesture { selectedHost = host }
                    CompanionRule()
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
                    .font(CompanionTheme.title)
                Text("\(host.host):\(host.port)")
                    .font(CompanionTheme.caption)
                    .foregroundStyle(CompanionTheme.mutedInk)
            }
            Spacer()
            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundColor(CompanionTheme.accent)
            }
        }
        .padding(.vertical, 14)
        .foregroundColor(CompanionTheme.ink)
    }
}
