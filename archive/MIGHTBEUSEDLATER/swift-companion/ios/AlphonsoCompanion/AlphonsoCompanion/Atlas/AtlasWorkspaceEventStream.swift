import Foundation

struct AtlasWorkspaceEvent: Equatable, Identifiable {
    let id: String
    let type: EventType
    let workspaceID: String
    let occurredAt: Date
    let briefing: AtlasBriefing

    enum EventType: String, Decodable, Equatable {
        case workspaceSnapshot = "workspace.snapshot"
        case runCreated = "run.created"
        case decisionReviewed = "decision.reviewed"
        case decisionConfirmed = "decision.confirmed"
    }
}

enum AtlasWorkspaceEventStreamError: LocalizedError, Equatable {
    case invalidResponse
    case unauthorized
    case forbidden
    case invalidPayload
    case server(status: Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Atlas Cloud returned an invalid live-sync response."
        case .unauthorized:
            return "Your Atlas session has expired. Sign in again to resume live updates."
        case .forbidden:
            return "This device is not trusted for Atlas live updates."
        case .invalidPayload:
            return "Atlas Cloud sent an unsupported live-sync event."
        case .server(let status):
            return "Atlas live updates failed with HTTP \(status)."
        }
    }
}

struct AtlasWorkspaceEventStream {
    let configuration: AtlasCloudConfiguration
    private let accessTokenProvider: any AtlasAccessTokenProvider
    private let deviceIdentifierProvider: any AtlasDeviceIdentifierProvider

    init(
        configuration: AtlasCloudConfiguration,
        accessTokenProvider: any AtlasAccessTokenProvider = AtlasKeychainAccessTokenProvider(),
        deviceIdentifierProvider: any AtlasDeviceIdentifierProvider = AtlasKeychainDeviceIdentifierProvider()
    ) {
        self.configuration = configuration
        self.accessTokenProvider = accessTokenProvider
        self.deviceIdentifierProvider = deviceIdentifierProvider
    }

    func events(workspaceID: String) -> AsyncThrowingStream<AtlasWorkspaceEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await consume(workspaceID: workspaceID, continuation: continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func consume(
        workspaceID: String,
        continuation: AsyncThrowingStream<AtlasWorkspaceEvent, Error>.Continuation
    ) async throws {
        var request = URLRequest(url: configuration.endpoint(pathComponents: ["workspaces", workspaceID, "events"]))
        request.httpMethod = "GET"
        request.timeoutInterval = 90
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(try accessTokenProvider.accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(try deviceIdentifierProvider.deviceID(), forHTTPHeaderField: "X-Alphonso-Device-Id")
        request.setValue("ios", forHTTPHeaderField: "X-Alphonso-Client")
        request.setValue(configuration.apiVersion, forHTTPHeaderField: "X-Alphonso-API-Version")

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AtlasWorkspaceEventStreamError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 401: throw AtlasWorkspaceEventStreamError.unauthorized
            case 403: throw AtlasWorkspaceEventStreamError.forbidden
            default: throw AtlasWorkspaceEventStreamError.server(status: http.statusCode)
            }
        }

        var eventID: String?
        var eventType: String?
        var dataLines: [String] = []
        for try await line in bytes.lines {
            if Task.isCancelled { return }
            if line.isEmpty {
                try emitEvent(
                    id: &eventID,
                    type: &eventType,
                    dataLines: &dataLines,
                    continuation: continuation
                )
                continue
            }
            if line.hasPrefix("id:") {
                eventID = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("event:") {
                eventType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }
        try emitEvent(
            id: &eventID,
            type: &eventType,
            dataLines: &dataLines,
            continuation: continuation
        )
    }

    private func emitEvent(
        id: inout String?,
        type: inout String?,
        dataLines: inout [String],
        continuation: AsyncThrowingStream<AtlasWorkspaceEvent, Error>.Continuation
    ) throws {
        defer {
            id = nil
            type = nil
            dataLines.removeAll()
        }
        guard !dataLines.isEmpty else { return }
        guard let receivedID = id,
              let receivedType = type,
              let eventType = AtlasWorkspaceEvent.EventType(rawValue: receivedType),
              let data = dataLines.joined(separator: "\n").data(using: .utf8) else {
            throw AtlasWorkspaceEventStreamError.invalidPayload
        }
        let envelope: AtlasWorkspaceEventEnvelope
        do {
            envelope = try Self.decoder.decode(AtlasWorkspaceEventEnvelope.self, from: data)
        } catch {
            throw AtlasWorkspaceEventStreamError.invalidPayload
        }
        guard envelope.id == receivedID, envelope.type == eventType else {
            throw AtlasWorkspaceEventStreamError.invalidPayload
        }
        continuation.yield(
            AtlasWorkspaceEvent(
                id: envelope.id,
                type: envelope.type,
                workspaceID: envelope.workspaceID,
                occurredAt: envelope.occurredAt,
                briefing: envelope.briefing.domain
            )
        )
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) { return date }
            let standard = ISO8601DateFormatter()
            standard.formatOptions = [.withInternetDateTime]
            if let date = standard.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO-8601 event timestamp.")
        }
        return decoder
    }
}

private struct AtlasWorkspaceEventEnvelope: Decodable {
    let id: String
    let type: AtlasWorkspaceEvent.EventType
    let workspaceID: String
    let occurredAt: Date
    let briefing: AtlasBriefingResponse
}
