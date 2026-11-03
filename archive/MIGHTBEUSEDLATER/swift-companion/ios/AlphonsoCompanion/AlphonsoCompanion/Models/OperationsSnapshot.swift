import Foundation

struct OperationsSnapshot: Equatable {
    static let empty = OperationsSnapshot(activeWork: [], recentOutcomes: [], approvals: [])

    let activeWork: [OperationsWorkItem]
    let recentOutcomes: [OperationsOutcome]
    let approvals: [ApprovalItem]

    init(activeWork: [OperationsWorkItem], recentOutcomes: [OperationsOutcome], approvals: [ApprovalItem]) {
        self.activeWork = activeWork
        self.recentOutcomes = recentOutcomes
        self.approvals = approvals
    }

    init?(dictionary: [String: Any]) {
        guard let operations = dictionary["operations"] as? [String: Any] else { return nil }
        let active = operations["activeWork"] as? [[String: Any]] ?? []
        let outcomes = operations["recentOutcomes"] as? [[String: Any]] ?? []
        let approvalsData = operations["approvals"] as? [[String: Any]] ?? []
        self.init(
            activeWork: active.compactMap(OperationsWorkItem.init(dictionary:)),
            recentOutcomes: outcomes.compactMap(OperationsOutcome.init(dictionary:)),
            approvals: approvalsData.compactMap(ApprovalItem.init(dictionary:))
        )
    }
}

struct ApprovalItem: Identifiable, Equatable {
    let id: String
    let status: String
    let riskLevel: String
    let actionType: String
    let reason: String
    let summary: String
    let createdAt: Date

    init?(dictionary: [String: Any]) {
        guard let id = dictionary["id"] as? String,
              let status = dictionary["status"] as? String,
              let riskLevel = dictionary["riskLevel"] as? String,
              let actionType = dictionary["actionType"] as? String,
              let reason = dictionary["reason"] as? String,
              let summary = dictionary["summary"] as? String else { return nil }
        self.id = id
        self.status = status
        self.riskLevel = riskLevel
        self.actionType = actionType
        self.reason = reason
        self.summary = summary

        // Parse date from ISO8601 string or fallback to UNIX epoch
        let dateString = dictionary["createdAt"] as? String ?? ""
        let formatter = ISO8601DateFormatter()
        self.createdAt = formatter.date(from: dateString) ?? Date(timeIntervalSince1970: 0)
    }
}

struct OperationsWorkItem: Identifiable, Equatable {
    let id: String
    let title: String
    let agent: String
    let status: String
    let commandID: String?
    let updatedAt: Date

    init?(dictionary: [String: Any]) {
        guard let id = dictionary["id"] as? String,
              let title = dictionary["title"] as? String,
              let agent = dictionary["agent"] as? String,
              let status = dictionary["status"] as? String else { return nil }
        self.id = id
        self.title = title
        self.agent = agent
        self.status = status
        self.commandID = dictionary["commandId"] as? String
        self.updatedAt = OperationsSnapshot.date(from: dictionary["timestampMs"])
    }
}

struct OperationsOutcome: Identifiable, Equatable {
    let id: String
    let summary: String
    let agent: String
    let status: String
    let completedAt: Date

    init?(dictionary: [String: Any]) {
        guard let id = dictionary["id"] as? String,
              let summary = dictionary["summary"] as? String,
              let agent = dictionary["agent"] as? String,
              let status = dictionary["status"] as? String else { return nil }
        self.id = id
        self.summary = summary
        self.agent = agent
        self.status = status
        self.completedAt = OperationsSnapshot.date(from: dictionary["timestampMs"])
    }
}

extension OperationsSnapshot {
    fileprivate static func date(from value: Any?) -> Date {
        guard let milliseconds = value as? NSNumber else { return Date(timeIntervalSince1970: 0) }
        return Date(timeIntervalSince1970: milliseconds.doubleValue / 1_000)
    }
}
