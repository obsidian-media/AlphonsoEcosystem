import Foundation

enum ConnectionState: String {
    case disconnected
    case connecting
    case connected
    case authenticated
    case failed
}

struct DiscoveredHost: Identifiable, Equatable {
    let name: String
    let host: String
    let port: UInt16

    var id: String {
        "\(name)|\(host)|\(port)"
    }
}

struct ConnectionEndpoint: Identifiable, Codable, Equatable {
    let host: String
    let port: UInt16
    let displayName: String
    let source: String
    let lastConnectedAt: Date

    var id: String {
        "\(host):\(port)"
    }
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

private func parseDate(_ value: Any?) -> Date {
    if let date = value as? Date { return date }
    if let str = value as? String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: str) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: str) { return date }
    }
    return Date()
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
        self.createdAt = parseDate(dict["createdAt"])
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
    let id: UUID
    let goalId: String
    let title: String
    let status: String
    let tasks: [String]
    
    init?(dict: [String: Any]) {
        guard let title = dict["title"] as? String else { return nil }
        self.id = UUID()
        self.goalId = dict["goalId"] as? String ?? ""
        self.title = title
        self.status = dict["status"] as? String ?? "pending"
        self.tasks = dict["tasks"] as? [String] ?? []
    }
    
    init(goalId: String, title: String, status: String, tasks: [String] = []) {
        self.id = UUID()
        self.goalId = goalId
        self.title = title
        self.status = status
        self.tasks = tasks
    }
}

struct TaskItem: Identifiable, Codable {
    let id: UUID
    let batchId: String
    let title: String
    let status: String
    let owner: String
    let risk: String
    
    init?(dict: [String: Any]) {
        guard let title = dict["title"] as? String else { return nil }
        self.id = UUID()
        self.batchId = dict["batchId"] as? String ?? ""
        self.title = title
        self.status = dict["status"] as? String ?? "pending"
        self.owner = dict["owner"] as? String ?? ""
        self.risk = dict["risk"] as? String ?? "low"
    }
    
    init(batchId: String, title: String, status: String, owner: String, risk: String) {
        self.id = UUID()
        self.batchId = batchId
        self.title = title
        self.status = status
        self.owner = owner
        self.risk = risk
    }
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
        self.createdAt = parseDate(dict["createdAt"])
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
