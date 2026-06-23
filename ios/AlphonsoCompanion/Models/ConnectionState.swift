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

struct Goal: Identifiable, Codable {
    let id = UUID()
    let title: String
    let description: String
    let status: String
    let createdAt: Date
}

struct Batch: Identifiable, Codable {
    let id = UUID()
    let goalId: String
    let title: String
    let status: String
    let tasks: [String]
}

struct TaskItem: Identifiable, Codable {
    let id = UUID()
    let batchId: String
    let title: String
    let status: String
    let owner: String
    let risk: String
}