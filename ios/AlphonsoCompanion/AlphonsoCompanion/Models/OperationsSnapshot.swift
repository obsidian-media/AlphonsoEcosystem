import Foundation

struct OperationsSnapshot: Equatable {
    static let empty = OperationsSnapshot(activeWork: [], recentOutcomes: [])

    let activeWork: [OperationsWorkItem]
    let recentOutcomes: [OperationsOutcome]

    init(activeWork: [OperationsWorkItem], recentOutcomes: [OperationsOutcome]) {
        self.activeWork = activeWork
        self.recentOutcomes = recentOutcomes
    }

    init?(dictionary: [String: Any]) {
        guard let operations = dictionary["operations"] as? [String: Any] else { return nil }
        let active = operations["activeWork"] as? [[String: Any]] ?? []
        let outcomes = operations["recentOutcomes"] as? [[String: Any]] ?? []
        self.init(
            activeWork: active.compactMap(OperationsWorkItem.init(dictionary:)),
            recentOutcomes: outcomes.compactMap(OperationsOutcome.init(dictionary:))
        )
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
