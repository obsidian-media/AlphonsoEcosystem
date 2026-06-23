import Foundation

enum ConnectionState: String {
    case disconnected
    case connecting
    case connected
    case authenticated
    case failed
}

struct DiscoveredHost: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let host: String
    let port: UInt16
}

struct Message: Identifiable, Codable {
    let id = UUID()
    let text: String
    let isIncoming: Bool
    let timestamp: Date
    let commandId: String?

    init(text: String, isIncoming: Bool, commandId: String? = nil) {
        self.text = text
        self.isIncoming = isIncoming
        self.timestamp = Date()
        self.commandId = commandId
    }
}

struct AgentStatus: Codable {
    let agent: String
    let status: String
    let detail: String?
}