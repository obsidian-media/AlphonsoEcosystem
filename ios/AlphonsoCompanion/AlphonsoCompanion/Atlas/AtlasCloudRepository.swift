import Foundation
import Security

// MARK: - Configuration and identity

struct AtlasCloudConfiguration: Equatable {
    let baseURL: URL
    let apiVersion: String

    init?(baseURL: URL, apiVersion: String = "v1") {
        guard baseURL.scheme?.lowercased() == "https",
              baseURL.host != nil,
              !apiVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        self.baseURL = baseURL
        self.apiVersion = apiVersion
    }

    static func fromBundle(_ bundle: Bundle = .main) -> AtlasCloudConfiguration? {
        guard let rawURL = bundle.object(forInfoDictionaryKey: "AtlasControlPlaneURL") as? String,
              let url = URL(string: rawURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return nil
        }
        let version = bundle.object(forInfoDictionaryKey: "AtlasControlPlaneAPIVersion") as? String ?? "v1"
        return AtlasCloudConfiguration(baseURL: url, apiVersion: version)
    }

    func endpoint(pathComponents: [String]) -> URL {
        pathComponents.reduce(baseURL.appending(path: "api").appending(path: apiVersion)) { partialURL, component in
            partialURL.appending(path: component)
        }
    }
}

protocol AtlasAccessTokenProvider {
    func accessToken() throws -> String
}

enum AtlasAccessTokenError: LocalizedError, Equatable {
    case unavailable
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Sign in to connect this workspace to the Alphonso control plane."
        case .keychain:
            return "The secure sign-in credential is unavailable on this device."
        }
    }
}

/// Dedicated Keychain storage for the future mobile account session. This intentionally
/// does not reuse Voice Cloud credentials or store an access token in UserDefaults.
protocol AtlasDeviceIdentifierProvider {
    func deviceID() throws -> String
}

enum AtlasDeviceIdentifierError: LocalizedError, Equatable {
    case keychain(OSStatus)

    var errorDescription: String? {
        "The secure Atlas device identifier is unavailable on this device."
    }
}

struct AtlasKeychainDeviceIdentifierProvider: AtlasDeviceIdentifierProvider {
    static let service = "com.alphonso.mobile.controlPlane"
    static let account = "device-id"

    func deviceID() throws -> String {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: Self.service,
            kSecAttrAccount: Self.account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess,
           let data = item as? Data,
           let existing = String(data: data, encoding: .utf8),
           UUID(uuidString: existing) != nil {
            return existing
        }
        if status != errSecSuccess && status != errSecItemNotFound {
            throw AtlasDeviceIdentifierError.keychain(status)
        }
        let identifier = UUID().uuidString
        try Self.save(deviceID: identifier)
        return identifier
    }

    static func save(deviceID: String) throws {
        guard UUID(uuidString: deviceID) != nil else { throw AtlasDeviceIdentifierError.keychain(errSecParam) }
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [
            kSecValueData: Data(deviceID.utf8),
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var add = query
            attributes.forEach { add[$0.key] = $0.value }
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw AtlasDeviceIdentifierError.keychain(addStatus) }
        } else if updateStatus != errSecSuccess {
            throw AtlasDeviceIdentifierError.keychain(updateStatus)
        }
    }

    static func remove() throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AtlasDeviceIdentifierError.keychain(status)
        }
    }
}

struct AtlasKeychainAccessTokenProvider: AtlasAccessTokenProvider {
    static let service = "com.alphonso.mobile.controlPlane"
    static let account = "access-token"

    func accessToken() throws -> String {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: Self.service,
            kSecAttrAccount: Self.account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status != errSecItemNotFound else { throw AtlasAccessTokenError.unavailable }
        guard status == errSecSuccess else { throw AtlasAccessTokenError.keychain(status) }
        guard let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty else {
            throw AtlasAccessTokenError.unavailable
        }
        return value
    }

    static func save(accessToken: String) throws {
        let data = Data(accessToken.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var add = query
            attributes.forEach { add[$0.key] = $0.value }
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw AtlasAccessTokenError.keychain(addStatus) }
        } else if updateStatus != errSecSuccess {
            throw AtlasAccessTokenError.keychain(updateStatus)
        }
    }

    static func remove() throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AtlasAccessTokenError.keychain(status)
        }
    }
}

// MARK: - HTTP transport

protocol AtlasHTTPTransport {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

struct AtlasURLSessionTransport: AtlasHTTPTransport {
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await URLSession.shared.data(for: request)
    }
}

enum AtlasCloudRepositoryError: LocalizedError, Equatable {
    case network(String)
    case invalidResponse
    case unauthorized
    case forbidden
    case notFound
    case server(status: Int, message: String)
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .network(let message):
            return "Could not reach the Alphonso control plane: \(message)"
        case .invalidResponse:
            return "The Alphonso control plane returned an invalid response."
        case .unauthorized:
            return "Your mobile session has expired. Sign in again to continue."
        case .forbidden:
            return "Your account does not have permission to perform this workspace action."
        case .notFound:
            return "This workspace record is no longer available. Refresh and try again."
        case .server(_, let message):
            return message
        case .invalidPayload:
            return "The Alphonso control plane returned an unsupported data format."
        }
    }
}

// MARK: - Versioned Cloud repository

struct AtlasCloudRepository: AtlasWorkspaceRepository {
    let configuration: AtlasCloudConfiguration
    private let accessTokenProvider: any AtlasAccessTokenProvider
    private let deviceIdentifierProvider: any AtlasDeviceIdentifierProvider
    private let transport: any AtlasHTTPTransport

    init(
        configuration: AtlasCloudConfiguration,
        accessTokenProvider: any AtlasAccessTokenProvider = AtlasKeychainAccessTokenProvider(),
        deviceIdentifierProvider: any AtlasDeviceIdentifierProvider = AtlasKeychainDeviceIdentifierProvider(),
        transport: any AtlasHTTPTransport = AtlasURLSessionTransport()
    ) {
        self.configuration = configuration
        self.accessTokenProvider = accessTokenProvider
        self.deviceIdentifierProvider = deviceIdentifierProvider
        self.transport = transport
    }

    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "briefing"],
            method: "GET"
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode(AtlasBriefingResponse.self, from: data).domain
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        let payload = AtlasCreateDraftRequest(
            brief: brief,
            desiredOutcome: desiredOutcome,
            executionPosture: posture
        )
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "runs", "drafts"],
            method: "POST",
            body: try Self.encoder.encode(payload)
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode(AtlasRunResponse.self, from: data).domain
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "decisions", decisionID, "reviews"],
            method: "POST",
            body: try Self.encoder.encode(AtlasDecisionReviewRequest())
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode(AtlasDecisionResponse.self, from: data).domain
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    func requestActionChallenge(workspaceID: String, decisionID: String) async throws -> AtlasActionChallenge {
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "decisions", decisionID, "action-challenges"],
            method: "POST"
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode(AtlasActionChallengeResponse.self, from: data).domain
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    func recordActionConfirmation(
        workspaceID: String,
        decisionID: String,
        challengeID: String
    ) async throws -> AtlasDecisionConfirmationReceipt {
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "decisions", decisionID, "action-confirmations"],
            method: "POST",
            body: try Self.encoder.encode(
                AtlasDecisionActionConfirmationRequest(
                    challengeID: challengeID,
                    localAuthenticationCompleted: true
                )
            )
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode(AtlasDecisionActionConfirmationResponse.self, from: data).domain
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    func loadAuditReceipts(workspaceID: String) async throws -> [AtlasAuditReceipt] {
        let request = try authorizedRequest(
            path: ["workspaces", workspaceID, "audit-receipts"],
            method: "GET"
        )
        let data = try await execute(request)
        do {
            return try Self.decoder.decode([AtlasAuditReceiptResponse].self, from: data).map(\.domain)
        } catch {
            throw AtlasCloudRepositoryError.invalidPayload
        }
    }

    private func authorizedRequest(path: [String], method: String, body: Data? = nil) throws -> URLRequest {
        var request = URLRequest(url: configuration.endpoint(pathComponents: path))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try accessTokenProvider.accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(try deviceIdentifierProvider.deviceID(), forHTTPHeaderField: "X-Alphonso-Device-Id")
        request.setValue("ios", forHTTPHeaderField: "X-Alphonso-Client")
        request.setValue(configuration.apiVersion, forHTTPHeaderField: "X-Alphonso-API-Version")
        request.httpBody = body
        return request
    }

    private func execute(_ request: URLRequest) async throws -> Data {
        let response: (Data, URLResponse)
        do {
            response = try await transport.data(for: request)
        } catch {
            throw AtlasCloudRepositoryError.network(error.localizedDescription)
        }
        guard let http = response.1 as? HTTPURLResponse else {
            throw AtlasCloudRepositoryError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 401: throw AtlasCloudRepositoryError.unauthorized
            case 403: throw AtlasCloudRepositoryError.forbidden
            case 404: throw AtlasCloudRepositoryError.notFound
            default:
                throw AtlasCloudRepositoryError.server(
                    status: http.statusCode,
                    message: Self.serverMessage(from: response.0) ?? "The Alphonso control plane could not complete this request."
                )
            }
        }
        return response.0
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
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
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO-8601 date.")
        }
        return decoder
    }

    private static func serverMessage(from data: Data) -> String? {
        struct ErrorEnvelope: Decodable { let message: String? }
        return try? decoder.decode(ErrorEnvelope.self, from: data).message
    }
}

enum AtlasWorkspaceRepositoryFactory {
    static func makeDefault(bundle: Bundle = .main) -> any AtlasWorkspaceRepository {
        guard let configuration = AtlasCloudConfiguration.fromBundle(bundle) else {
            return AtlasFixtureRepository()
        }
        return AtlasCloudRepository(configuration: configuration)
    }
}

// MARK: - v1 response contract

private struct AtlasCreateDraftRequest: Encodable {
    let brief: String
    let desiredOutcome: String
    let executionPosture: AtlasExecutionPosture
}

private struct AtlasDecisionReviewRequest: Encodable {}

private struct AtlasDecisionActionConfirmationRequest: Encodable {
    let challengeID: String
    let localAuthenticationCompleted: Bool
}

struct AtlasActionChallengeResponse: Decodable {
    let id: String
    let decisionID: String
    let policyCode: String
    let statement: String
    let requiresLocalAuthentication: Bool
    let status: String
    let expiresAt: Date

    var domain: AtlasActionChallenge {
        AtlasActionChallenge(
            id: id,
            decisionID: decisionID,
            policyCode: policyCode,
            statement: statement,
            requiresLocalAuthentication: requiresLocalAuthentication,
            expiresAt: expiresAt
        )
    }
}

struct AtlasDecisionActionConfirmationResponse: Decodable {
    let receiptID: String
    let decision: AtlasDecisionResponse
    let executionStatus: String

    var domain: AtlasDecisionConfirmationReceipt {
        AtlasDecisionConfirmationReceipt(
            id: receiptID,
            decision: decision.domain,
            executionStatus: executionStatus
        )
    }
}

struct AtlasAuditReceiptResponse: Decodable {
    let id: String
    let workspaceID: String
    let decisionID: String?
    let challengeID: String?
    let deviceID: String?
    let eventType: AtlasAuditEventType
    let executionStatus: String
    let correlationID: String
    let occurredAt: Date

    var domain: AtlasAuditReceipt {
        AtlasAuditReceipt(
            id: id,
            workspaceID: workspaceID,
            decisionID: decisionID,
            challengeID: challengeID,
            deviceID: deviceID,
            eventType: eventType,
            executionStatus: executionStatus,
            correlationID: correlationID,
            occurredAt: occurredAt
        )
    }
}

struct AtlasBriefingResponse: Decodable {
    let workspace: AtlasWorkspaceResponse
    let freshness: AtlasFreshnessResponse
    let activeRuns: [AtlasRunResponse]
    let outcomes: [AtlasOutcomeResponse]
    let decisions: [AtlasDecisionResponse]
    let refreshedAt: Date

    var domain: AtlasBriefing {
        AtlasBriefing(
            workspace: workspace.domain,
            freshness: freshness.domain,
            activeRuns: activeRuns.map(\.domain),
            outcomes: outcomes.map(\.domain),
            decisions: decisions.map(\.domain),
            refreshedAt: refreshedAt
        )
    }
}

struct AtlasWorkspaceResponse: Decodable {
    let id: String
    let name: String
    let posture: AtlasExecutionPosture
    let memberRole: String

    var domain: AtlasWorkspace {
        AtlasWorkspace(id: id, name: name, posture: posture, memberRole: memberRole)
    }
}

struct AtlasFreshnessResponse: Decodable {
    let state: String
    let minutes: Int?
    let lastConfirmedAt: Date?

    var domain: AtlasFreshness {
        switch state.lowercased() {
        case "current":
            return .current
        case "delayed":
            return .delayed(minutes: minutes ?? 0)
        default:
            return .offline(lastConfirmedAt: lastConfirmedAt ?? Date())
        }
    }
}

struct AtlasRunResponse: Decodable {
    let id: String
    let title: String
    let summary: String
    let owner: String
    let phase: AtlasRunPhase
    let posture: AtlasExecutionPosture
    let updatedAt: Date
    let traceId: String

    var domain: AtlasRun {
        AtlasRun(
            id: id,
            title: title,
            summary: summary,
            owner: owner,
            phase: phase,
            posture: posture,
            updatedAt: updatedAt,
            traceID: traceId
        )
    }
}

struct AtlasOutcomeResponse: Decodable {
    let id: String
    let title: String
    let detail: String
    let completedAt: Date
    let traceId: String

    var domain: AtlasOutcome {
        AtlasOutcome(id: id, title: title, detail: detail, completedAt: completedAt, traceID: traceId)
    }
}

struct AtlasDecisionResponse: Decodable {
    let id: String
    let title: String
    let summary: String
    let affectedResource: String
    let executionDetail: String
    let policyCode: String
    let policyReason: String
    let evidenceSummary: String
    let risk: AtlasDecisionRisk
    let state: AtlasDecisionState
    let expiresAt: Date
    let runId: String

    var domain: AtlasDecision {
        AtlasDecision(
            id: id,
            title: title,
            summary: summary,
            affectedResource: affectedResource,
            executionDetail: executionDetail,
            policyCode: policyCode,
            policyReason: policyReason,
            evidenceSummary: evidenceSummary,
            risk: risk,
            state: state,
            expiresAt: expiresAt,
            runID: runId
        )
    }
}
