import Combine
import Foundation
import UIKit

struct AtlasDeviceEnrollmentResponse: Decodable, Equatable {
    let status: String
    let deviceID: String
    let deviceTrust: String

    enum CodingKeys: String, CodingKey {
        case status
        case deviceID = "device_id"
        case deviceTrust = "device_trust"
    }
}

enum AtlasEnrollmentError: LocalizedError, Equatable {
    case notConfigured
    case invalidResponse
    case unauthorized
    case forbidden
    case network(String)
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Atlas Cloud is not configured in this app build."
        case .invalidResponse:
            return "Atlas Cloud returned an invalid enrollment response."
        case .unauthorized:
            return "Your Atlas session has expired. Sign in again to continue."
        case .forbidden:
            return "This device is not permitted to enroll for Atlas Cloud."
        case .network(let message):
            return "Could not enroll this device with Atlas Cloud: \(message)"
        case .server(_, let message):
            return message
        }
    }
}

struct AtlasEnrollmentClient {
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

    func enroll(displayName: String) async throws -> AtlasDeviceEnrollmentResponse {
        let deviceID = try deviceIdentifierProvider.deviceID()
        var request = URLRequest(url: configuration.endpoint(pathComponents: ["devices", "enroll"]))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try accessTokenProvider.accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(deviceID, forHTTPHeaderField: "X-Alphonso-Device-Id")
        request.setValue("ios", forHTTPHeaderField: "X-Alphonso-Client")
        request.setValue(configuration.apiVersion, forHTTPHeaderField: "X-Alphonso-API-Version")
        request.httpBody = try JSONEncoder().encode(AtlasDeviceEnrollmentPayload(deviceID: deviceID, displayName: displayName))

        let response: (Data, URLResponse)
        do {
            response = try await transport.data(for: request)
        } catch {
            throw AtlasEnrollmentError.network(error.localizedDescription)
        }
        guard let http = response.1 as? HTTPURLResponse else {
            throw AtlasEnrollmentError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            switch http.statusCode {
            case 401: throw AtlasEnrollmentError.unauthorized
            case 403: throw AtlasEnrollmentError.forbidden
            default:
                throw AtlasEnrollmentError.server(status: http.statusCode, message: Self.serverMessage(response.0))
            }
        }
        guard let enrolled = try? JSONDecoder().decode(AtlasDeviceEnrollmentResponse.self, from: response.0),
              enrolled.deviceID == deviceID else {
            throw AtlasEnrollmentError.invalidResponse
        }
        return enrolled
    }

    private static func serverMessage(_ data: Data) -> String {
        struct ErrorEnvelope: Decodable { let detail: String? }
        if let detail = try? JSONDecoder().decode(ErrorEnvelope.self, from: data).detail,
           let detail,
           !detail.isEmpty {
            return detail
        }
        return "Atlas Cloud could not enroll this device."
    }
}

@MainActor
final class AtlasIdentityService: ObservableObject {
    enum State: Equatable {
        case unavailable
        case signedOut
        case enrolling
        case enrolled(deviceTrust: String)
        case failed(String)
    }

    @Published private(set) var state: State

    private let voiceCloudService: VoiceCloudService

    init(voiceCloudService: VoiceCloudService) {
        self.voiceCloudService = voiceCloudService
        state = AtlasCloudConfiguration.fromBundle() == nil ? .unavailable : .signedOut
    }

    /// Hands the shared Supabase account session to Atlas only after the existing
    /// magic-link flow has completed and the device can be enrolled at the Atlas API.
    func handleSignInCallback(_ url: URL) async {
        do {
            try await voiceCloudService.completeMagicLink(url)
            try await restoreAndEnroll()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Refreshes the existing user session through Voice Cloud, mirrors the short-lived
    /// access token into Atlas's dedicated Keychain slot, then requires server enrollment.
    func restoreAndEnroll() async throws {
        guard let configuration = AtlasCloudConfiguration.fromBundle() else {
            state = .unavailable
            return
        }
        state = .enrolling
        do {
            let accessToken = try await voiceCloudService.atlasAccessToken()
            try AtlasKeychainAccessTokenProvider.save(accessToken: accessToken)
            let client = AtlasEnrollmentClient(configuration: configuration)
            let receipt = try await client.enroll(displayName: UIDevice.current.name)
            state = .enrolled(deviceTrust: receipt.deviceTrust)
        } catch {
            try? AtlasKeychainAccessTokenProvider.remove()
            state = .failed(error.localizedDescription)
            throw error
        }
    }

    func signOut() {
        try? AtlasKeychainAccessTokenProvider.remove()
        try? AtlasKeychainDeviceIdentifierProvider.remove()
        state = AtlasCloudConfiguration.fromBundle() == nil ? .unavailable : .signedOut
    }
}

private struct AtlasDeviceEnrollmentPayload: Encodable {
    let deviceID: String
    let displayName: String

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case displayName = "display_name"
    }
}
