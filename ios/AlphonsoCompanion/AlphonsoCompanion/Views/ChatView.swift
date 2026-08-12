import SwiftUI

struct ChatView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    @State private var inputText = ""
    @State private var activeCommandID: String?
    @State private var selectedAgentID: String = "alphonso"

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        if webSocketService.messages.isEmpty {
                            VStack(spacing: 12) {
                                Image(systemName: webSocketService.connectionState == .authenticated ? "message" : "wifi.slash")
                                    .font(.largeTitle)
                                    .foregroundStyle(.secondary)
                                Text(webSocketService.connectionState == .authenticated ? "No messages yet" : "Connect to the desktop to start chatting")
                                    .font(.headline)
                                    .foregroundStyle(.secondary)
                                if let lastMessageReceivedAt = webSocketService.lastMessageReceivedAt {
                                    Text("Last message \(lastMessageReceivedAt, style: .relative)")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                        }
                        LazyVStack(alignment: .leading, spacing: 12) {
                            let msgs = Array(webSocketService.messages)
                            ForEach(msgs) { msg in
                                MessageBubble(message: msg)
                                    .id(msg.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: webSocketService.messages.count) { _, _ in
                        withAnimation {
                            proxy.scrollTo(webSocketService.messages.last?.id, anchor: .bottom)
                        }
                    }
                }

                HStack(alignment: .bottom) {
                    TextField("Ask Alphonso...", text: $inputText, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...5)

                    Button(action: sendMessage) {
                        Image(systemName: activeCommandID == nil ? "arrow.up.circle.fill" : "stop.circle.fill")
                            .font(.title2)
                    }
                    .accessibilityLabel(activeCommandID == nil ? "Send message" : "Stop response")
                    .disabled(activeCommandID == nil && (inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || webSocketService.connectionState != .authenticated))
                }
                .padding()
                .background(.regularMaterial)

                if activeCommandID != nil {
                    Label("Alphonso is responding", systemImage: "ellipsis.message")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 8)
                }
            }
            .navigationTitle("Chat")
            .safeAreaInset(edge: .top) {
                if let hint = webSocketService.connectionHint,
                   webSocketService.connectionState != .authenticated {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)
                        .padding(.top, 4)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("Target Agent", selection: $selectedAgentID) {
                            Text("Alphonso").tag("alphonso")
                            Text("Jose").tag("jose")
                            Text("Hector").tag("hector")
                            Text("Miya").tag("miya")
                            Text("Maria").tag("maria")
                            Text("Marcus").tag("marcus")
                            Text("Echo").tag("echo")
                            Text("Sentinel").tag("sentinel")
                            Text("Nova").tag("nova")
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(selectedAgentID.capitalized)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            Image(systemName: "chevron.down")
                                .font(.caption2)
                        }
                        .foregroundStyle(CompanionTheme.accent)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if webSocketService.connectionState == .authenticated {
                        Button("Status") {
                            webSocketService.getStatus()
                        }
                    }
                }
            }
            .onChange(of: webSocketService.activeCommandIDs) { _, _ in
                guard let activeCommandID, !webSocketService.activeCommandIDs.contains(activeCommandID) else { return }
                self.activeCommandID = nil
            }
            .onAppear {
                if let preconfigured = webSocketService.preconfiguredAgentID {
                    selectedAgentID = preconfigured
                    webSocketService.preconfiguredAgentID = nil
                }
            }
        }
    }

    private func sendMessage() {
        if let activeCommandID {
            webSocketService.abortCommand(commandId: activeCommandID)
            return
        }

        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        activeCommandID = webSocketService.sendCommand(text: text, agentID: selectedAgentID)
    }
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        VStack(alignment: message.isIncoming ? .leading : .trailing, spacing: 4) {
            Text(message.text)
                .padding(12)
                .background(
                    message.isIncoming ?
                        Color(UIColor.systemGray5) :
                        Color.accentColor
                )
                .foregroundColor(message.isIncoming ? .primary : .white)
                .cornerRadius(16)

            Text(message.timestamp, style: .time)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: message.isIncoming ? .leading : .trailing)
    }
}
