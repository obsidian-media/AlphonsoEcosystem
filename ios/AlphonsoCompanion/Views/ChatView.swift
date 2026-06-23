import SwiftUI

struct ChatView: View {
    @EnvironmentObject var webSocketService: WebSocketService

    @State private var inputText = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(webSocketService.messages) { msg in
                                MessageBubble(message: msg)
                                    .id(msg.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: webSocketService.messages.count) { _ in
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
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .disabled(inputText.isEmpty || webSocketService.connectionState != .authenticated)
                }
                .padding()
                .background(.regularMaterial)
            }
            .navigationTitle("Chat")
            .toolbar {
                if webSocketService.connectionState == .authenticated {
                    Button("Status") {
                        webSocketService.getStatus()
                    }
                }
            }
        }
    }

    private func sendMessage() {
        let text = inputText
        inputText = ""
        _ = webSocketService.sendCommand(text: text)
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