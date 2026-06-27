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
    let id: UUID
    let title: String
    let description: String
    let status: String
    let createdAt: Date
    
    init?(dict: [String: Any]) {
        guard let title = dict["title"] as? String else { return nil }
        self.id = UUID()
        self.title = title
        self.description = dict["description"] as? String ?? ""
        self.status = dict["status"] as? String ?? "pending"
        self.createdAt = dict["createdAt"] as? Date ?? Date()
    }
    
    init(title: String, description: String, status: String) {
        self.id = UUID()
        self.title = title
        self.description = description
        self.status = status
        self.createdAt = Date()
    }
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

struct BoardroomSession: Identifiable, Codable {
    let id: UUID
    let title: String
    let status: String
    let createdAt: Date
    let goals: [Goal]
    
    init?(dict: [String: Any]) {
        guard let title = dict["title"] as? String else { return nil }
        self.id = UUID()
        self.title = title
        self.status = dict["status"] as? String ?? "active"
        self.createdAt = dict["createdAt"] as? Date ?? Date()
        self.goals = (dict["goals"] as? [[String: Any]] ?? []).compactMap { Goal(dict: $0) }
    }
    
    init(title: String, status: String, goals: [Goal] = []) {
        self.id = UUID()
        self.title = title
        self.status = status
        self.createdAt = Date()
        self.goals = goals
    }
}