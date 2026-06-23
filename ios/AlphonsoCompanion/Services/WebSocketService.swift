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

    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var reconnectDelay: Double = 1.0
    private var host: String?
    private var pin: String?

    private var subscriptions = Set<AnyCancellable>()

    func connect(host: String, port: UInt16, pin: String) {
        self.host = host
        self.pin = pin
        let url = URL(string: "ws://\(host):\(port)")!
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        connectionState = .connecting
        authenticate(pin: pin)
        receive()
    }

    private func authenticate(pin: String) {
        let msg = #"{"method":"authenticate","params":{"pin":"\#(pin)"}}"#
        send(text: msg)
    }

    func sendCommand(text: String) -> String {
        let id = UUID().uuidString
        let msg = """
        {"id":"\(id)","method":"send_command","params":{"text":"\(text)"}}
        """
        send(text: msg)
        messages.append(Message(text: text, isIncoming: false, commandId: id))
        return id
    }

    func getStatus() {
        let msg = #"{"id":"status","method":"get_status","params":{}"#
        send(text: msg)
    }

    func abortCommand(commandId: String) {
        let msg = """
        {"id":"abort","method":"abort_command","params":{"commandId":"\(commandId)"}}
        """
        send(text: msg)
    }

    func sendRaw(text: String) {
        send(text: text)
    }

    private func send(text: String) {
        webSocketTask?.send(.string(text)) { error in
            if let error = error {
                self.errorMessage = error.localizedDescription
            }
        }
    }

    private func receive() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleMessage(text)
                    }
                default:
                    break
                }
                self?.receive()
            case .failure(let error):
                self?.handleError(error)
                self?.scheduleReconnect()
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
                connectionState = .authenticated
            }
        }
    }

    private func handleResult(_ json: [String: Any]) {
        if let result = json["result"] as? [String: Any] {
            if result["authenticated"] as? Bool == true {
                connectionState = .authenticated
            } else if let goals = result["goals"] as? [[String: Any]] {
                parseBoardroomResponse(result)
            }
        }
    }

    private func parseBoardroomResponse(_ json: [String: Any]) {
        // Parse boardroom data and update published state
        if let goals = json["goals"] as? [[String: Any]] {
            // TODO: Update goals state if BoardroomView observes via @Published
        }
    }

    private func handleError(_ json: [String: Any]) {
        if let error = json["error"] as? [String: Any],
           let code = error["code"] as? Int {
            if code == 401 {
                connectionState = .disconnected
                errorMessage = "Invalid PIN"
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
            }
        case "token":
            if let payload = payload as? [String: Any],
               let commandId = payload["commandId"] as? String,
               let token = payload["token"] as? String {
                updateStreamingMessage(commandId: commandId, token: token)
            }
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
        connectionState = .failed
        errorMessage = error.localizedDescription
    }

    private func scheduleReconnect() {
        guard let host = host, let pin = pin else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            guard let self else { return }
            reconnectDelay = min(reconnectDelay * 2, 30.0)
            connect(host: host, port: 8765, pin: pin)
        }
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        connectionState = .disconnected
        reconnectDelay = 1.0
    }
}