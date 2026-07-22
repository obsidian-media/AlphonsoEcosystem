import Foundation
import Combine

@MainActor
class WebSocketService: ObservableObject {
    @Published var connectionState: ConnectionState = .disconnected
    @Published var messages: [Message] = []
    @Published var agentStatuses: [String: AgentStatus] = [:]
    @Published var errorMessage: String?
    @Published var tokenCount: Int = 0
    @Published var isStreaming: Bool = false
    @Published private(set) var activeCommandIDs: Set<String> = []
    @Published var boardroomSessions: [BoardroomSession] = []
    @Published var recentEndpoints: [ConnectionEndpoint] = []
    @Published var lastSuccessfulConnectionAt: Date?
    @Published var lastMessageReceivedAt: Date?
    @Published var lastBoardroomRefreshAt: Date?
    @Published var connectionHint: String?

    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var host: String?
    private var port: UInt16?
    private var pin: String?
    private var pendingDisplayName: String?
    private var pendingSource: String = "manual"
    private var connectionMachine = CompanionConnectionStateMachine()
    private var shouldReconnect = false
    private var pendingReconnectWorkItem: DispatchWorkItem?
    private let recentEndpointsKey = "com.alphonso.companion.recentEndpoints"

    private var subscriptions = Set<AnyCancellable>()

    init() {
        recentEndpoints = Self.loadRecentEndpoints(from: recentEndpointsKey)
    }

    func connect(host: String, port: UInt16, pin: String, displayName: String? = nil, source: String = "manual", resetBackoff: Bool = true) {
        pendingReconnectWorkItem?.cancel()
        pendingReconnectWorkItem = nil
        pendingDisplayName = displayName
        pendingSource = source
        if resetBackoff {
            connectionMachine.startConnecting()
        } else {
            connectionMachine.beginReconnectAttempt()
        }
        shouldReconnect = connectionMachine.shouldReconnect
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        self.host = host
        self.port = port
        self.pin = pin
        connectionHint = "Connecting to \(displayName ?? host):\(port)"
        guard let url = Self.makeWebSocketURL(host: host, port: port) else {
            connectionMachine.disconnectManually()
            shouldReconnect = false
            connectionState = connectionMachine.connectionState
            errorMessage = "Invalid host or port"
            connectionHint = "Could not form websocket URL"
            return
        }
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        connectionState = connectionMachine.connectionState
        authenticate(pin: pin)
        receive()
    }

    private func authenticate(pin: String) {
        sendJSONMessage([
            "method": "authenticate",
            "params": ["pin": pin]
        ])
    }

    func sendCommand(
        text: String,
        agentID: String = "alphonso",
        language: String = "en-US",
        voiceConversation: Bool = false
    ) -> String {
        let id = UUID().uuidString
        guard connectionState == .authenticated else {
            errorMessage = "Connect to the desktop before sending a message"
            connectionHint = "Chat is available after pairing completes"
            return id
        }
        activeCommandIDs.insert(id)
        sendJSONMessage([
            "id": id,
            "method": "send_command",
            "params": [
                "text": text,
                "agentId": agentID,
                "language": language,
                "voiceConversation": voiceConversation,
            ]
        ])
        messages.append(Message(text: text, isIncoming: false, commandId: id))
        return id
    }

    func getStatus() {
        sendJSONMessage([
            "id": "status",
            "method": "get_status",
            "params": [String: Any]()
        ])
    }

    func abortCommand(commandId: String) {
        sendJSONMessage([
            "id": "abort",
            "method": "abort_command",
            "params": ["commandId": commandId]
        ])
    }

    func sendRaw(text: String) {
        send(text: text)
    }

    private func sendJSONMessage(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else {
            errorMessage = "Failed to encode websocket request"
            connectionHint = "Could not encode websocket payload"
            return
        }
        send(text: text)
    }

    private func send(text: String) {
        webSocketTask?.send(.string(text)) { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                if let error = error {
                    self.errorMessage = error.localizedDescription
                    self.connectionHint = "Send failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func receive() {
        webSocketTask?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .success(let message):
                    self.lastMessageReceivedAt = Date()
                    switch message {
                    case .string(let text):
                        self.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleMessage(text)
                        }
                    default:
                        break
                    }
                    self.receive()
                case .failure(let error):
                    self.handleError(error)
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if json["result"] != nil {
                    handleResult(json)
                } else if json["error"] != nil {
                    handleError(json)
                } else if let event = json["event"] as? String {
                    handleEvent(event: event, payload: json["payload"])
                }
            }
        } catch {
            // Try to parse as plain response
            if text.contains("\"authenticated\":true") {
                connectionMachine.markAuthenticated()
                connectionState = connectionMachine.connectionState
                recordSuccessfulConnection()
            }
        }
    }

    private func handleResult(_ json: [String: Any]) {
        if let result = json["result"] as? [String: Any] {
            if result["authenticated"] as? Bool == true {
                connectionMachine.markAuthenticated()
                connectionState = connectionMachine.connectionState
                recordSuccessfulConnection()
            } else if result["goals"] != nil {
                parseBoardroomResponse(result)
            }
        }
    }

    private func parseBoardroomResponse(_ json: [String: Any]) {
        // Parse boardroom sessions and update published state
        if let sessions = json["sessions"] as? [[String: Any]] {
            boardroomSessions = sessions.compactMap { BoardroomSession(dict: $0) }
        } else if let goals = json["goals"] as? [[String: Any]] {
            // Legacy format fallback
            boardroomSessions = goals.compactMap { goal in
                BoardroomSession(dict: goal)
            }
        }
        lastBoardroomRefreshAt = Date()
    }

    private func handleError(_ json: [String: Any]) {
        if let error = json["error"] as? [String: Any],
           let code = error["code"] as? Int {
            if code == 401 {
                connectionMachine.markInvalidPin()
                webSocketTask?.cancel(with: .protocolError, reason: nil)
                webSocketTask = nil
                connectionState = connectionMachine.connectionState
                errorMessage = "Invalid PIN"
                connectionHint = "Authentication failed: invalid PIN"
                shouldReconnect = connectionMachine.shouldReconnect
            }
        }
    }

    private func handleEvent(event: String, payload: Any?) {
        switch event {
        case "agent_status":
            if let payload = payload as? [String: Any],
               let agent = payload["agent"] as? String,
               let status = payload["status"] as? String {
                let agentStatus = AgentStatus(
                    agent: agent,
                    status: status,
                    detail: payload["detail"] as? String
                )
                agentStatuses[agent] = agentStatus
                connectionHint = "Agent status updated for \(agent)"
            }
        case "token":
            if let payload = payload as? [String: Any],
               let commandId = payload["commandId"] as? String,
               let token = payload["token"] as? String {
                isStreaming = true
                updateStreamingMessage(commandId: commandId, token: token)
            }
        case "done":
            isStreaming = false
            if let payload = payload as? [String: Any] {
                let commandId = payload["commandId"] as? String
                if let commandId {
                    activeCommandIDs.remove(commandId)
                }
                if let error = payload["error"] as? String {
                    errorMessage = error
                } else if let summary = payload["summary"] as? String, let commandId = commandId {
                    if let idx = messages.firstIndex(where: { $0.commandId == commandId && $0.isIncoming }) {
                        messages[idx] = Message(
                            text: summary,
                            isIncoming: true,
                            commandId: commandId
                        )
                    }
                }
            }
            connectionHint = "Command finished"
        default:
            break
        }
    }

    private func updateStreamingMessage(commandId: String, token: String) {
        if let idx = messages.firstIndex(where: { $0.commandId == commandId && $0.isIncoming }) {
            messages[idx] = Message(
                text: messages[idx].text + token,
                isIncoming: true,
                commandId: commandId
            )
        } else {
            messages.append(Message(text: token, isIncoming: true, commandId: commandId))
        }
    }

    private func handleError(_ error: Error) {
        connectionMachine.markTransportFailure()
        connectionState = connectionMachine.connectionState
        webSocketTask = nil
        errorMessage = error.localizedDescription
        connectionHint = "Transport error: \(error.localizedDescription)"
    }

    private func scheduleReconnect() {
        guard connectionMachine.shouldReconnect else { return }
        guard let host = host, let port = port, let pin = pin else { return }
        let delay = connectionMachine.reconnectDelay
        connectionMachine.nextReconnectDelay()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.connectionMachine.shouldReconnect else { return }
            self.connectionHint = "Reconnecting now"
            self.connect(host: host, port: port, pin: pin, displayName: self.pendingDisplayName ?? host, source: self.pendingSource, resetBackoff: false)
        }
        pendingReconnectWorkItem = workItem
        connectionHint = "Reconnecting in \(Int(delay))s"
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    func disconnect() {
        connectionMachine.disconnectManually()
        shouldReconnect = connectionMachine.shouldReconnect
        pendingReconnectWorkItem?.cancel()
        pendingReconnectWorkItem = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        host = nil
        port = nil
        pin = nil
        pendingDisplayName = nil
        pendingSource = "manual"
        activeCommandIDs.removeAll()
        connectionState = connectionMachine.connectionState
        connectionHint = "Disconnected"
    }

    func pauseReconnects() {
        connectionMachine.disconnectManually()
        shouldReconnect = false
        pendingReconnectWorkItem?.cancel()
        pendingReconnectWorkItem = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        activeCommandIDs.removeAll()
        connectionState = connectionMachine.connectionState
        connectionHint = "Reconnect paused"
    }

    private func recordSuccessfulConnection() {
        lastSuccessfulConnectionAt = Date()
        if let host = host, let port = port {
            let endpoint = ConnectionEndpoint(
                host: host,
                port: port,
                displayName: pendingDisplayName ?? host,
                source: pendingSource,
                lastConnectedAt: lastSuccessfulConnectionAt ?? Date()
            )
            recentEndpoints = Self.mergeRecentEndpoint(endpoint, into: recentEndpoints)
            Self.saveRecentEndpoints(recentEndpoints, key: recentEndpointsKey)
        }
        connectionHint = "Connected"
    }

    private static func mergeRecentEndpoint(_ endpoint: ConnectionEndpoint, into endpoints: [ConnectionEndpoint]) -> [ConnectionEndpoint] {
        var merged = endpoints.filter { $0.id != endpoint.id }
        merged.insert(endpoint, at: 0)
        return Array(merged.prefix(5))
    }

    private static func loadRecentEndpoints(from key: String) -> [ConnectionEndpoint] {
        guard let raw = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([ConnectionEndpoint].self, from: raw)) ?? []
    }

    private static func saveRecentEndpoints(_ endpoints: [ConnectionEndpoint], key: String) {
        guard let data = try? JSONEncoder().encode(endpoints) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private static func makeWebSocketURL(host: String, port: UInt16) -> URL? {
        var components = URLComponents()
        components.scheme = "ws"
        components.host = host
        components.port = Int(port)
        return components.url
    }
}
