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
        VStack(alignment: message.isIncoming ? .leading : .trailing, spacing: 6) {
            let blocks = parseChatBlocks(from: message.text)

            ForEach(blocks) { block in
                if block.isCode {
                    CodeBlockCard(code: block.content, language: block.codeLanguage)
                } else {
                    TextBlockBubble(text: block.content, isIncoming: message.isIncoming)
                }
            }

            Text(message.timestamp, style: .time)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(CompanionTheme.quietInk)
                .padding(.horizontal, 4)
        }
        .frame(maxWidth: .infinity, alignment: message.isIncoming ? .leading : .trailing)
    }
}

struct TextBlockBubble: View {
    let text: String
    let isIncoming: Bool

    var body: some View {
        Text(text)
            .font(CompanionTheme.body)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                isIncoming ?
                    CompanionTheme.surface :
                    CompanionTheme.accent
            )
            .foregroundColor(CompanionTheme.ink)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct CodeBlockCard: View {
    let code: String
    let language: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(language?.uppercased() ?? "CODE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(CompanionTheme.mutedInk)
                Spacer()
                Button {
                    UIPasteboard.general.string = code
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 10))
                        Text("Copy")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(CompanionTheme.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(CompanionTheme.canvas)
            
            CompanionRule()
            
            ScrollView(.horizontal, showsIndicators: true) {
                Text(code)
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .foregroundStyle(CompanionTheme.ink)
                    .padding(14)
                    .textSelection(.enabled)
            }
            .background(Color(red: 0.05, green: 0.05, blue: 0.06))
        }
        .frame(maxWidth: 500, alignment: .leading)
        .background(CompanionTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(CompanionTheme.rule, lineWidth: 1)
        )
    }
}

struct ChatBlock: Identifiable {
    let id = UUID()
    let isCode: Bool
    let codeLanguage: String?
    let content: String
}

func parseChatBlocks(from text: String) -> [ChatBlock] {
    let parts = text.components(separatedBy: "```")
    var blocks: [ChatBlock] = []
    
    for (index, part) in parts.enumerated() {
        let isCode = index % 2 == 1
        let trimmed = part.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }
        
        if isCode {
            // Find language tag (first line)
            let lines = trimmed.components(separatedBy: .newlines)
            let firstLine = lines.first ?? ""
            let isLanguage = firstLine.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil
            
            if isLanguage {
                let language = firstLine
                let codeContent = lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                blocks.append(ChatBlock(isCode: true, codeLanguage: language, content: codeContent))
            } else {
                blocks.append(ChatBlock(isCode: true, codeLanguage: nil, content: trimmed))
            }
        } else {
            blocks.append(ChatBlock(isCode: false, codeLanguage: nil, content: part))
        }
    }
    
    // Fallback if no blocks were matched
    if blocks.isEmpty && !text.isEmpty {
        blocks.append(ChatBlock(isCode: false, codeLanguage: nil, content: text))
    }
    
    return blocks
}
