import AVFoundation
import Combine
import Foundation
import Security
import UIKit

struct VoiceCloudHistoryMessage: Encodable, Equatable {
    let role: String
    let content: String
}

struct VoiceCloudResponse: Decodable {
    let sessionID: String
    let requestID: String
    let agent: String
    let reply: String
    let audioBase64: String
    let ttsModel: String
    let language: String
    let state: String

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case requestID = "request_id"
        case agent
        case reply
        case audioBase64 = "audio_base64"
        case ttsModel = "tts_model"
        case language
        case state
    }

    var audioData: Data? {
        guard !audioBase64.isEmpty else { return nil }
        return Data(base64Encoded: audioBase64)
    }
}

private struct SupabaseSession: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        refreshToken = try container.decode(String.self, forKey: .refreshToken)
        if let unix = try container.decodeIfPresent(Double.self, forKey: .expiresAt) {
            expiresAt = Date(timeIntervalSince1970: unix)
        } else {
            expiresAt = Date().addingTimeInterval(try container.decodeIfPresent(Double.self, forKey: .expiresIn) ?? 3600)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(accessToken, forKey: .accessToken)
        try container.encode(refreshToken, forKey: .refreshToken)
        try container.encode(expiresAt.timeIntervalSince1970, forKey: .expiresAt)
    }
}

@MainActor
final class VoiceCloudService: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var endpoint: String
    @Published private(set) var apiKey: String
    @Published private(set) var statusMessage: String
    @Published private(set) var authenticationStatus: String

    var onSpeakingEnded: (() -> Void)?

    private let endpointKey = "com.alphonso.companion.voiceCloudEndpoint"
    private let apiKeyAccount = "com.alphonso.companion.voiceCloudApiKey"
    private let legacyAPIKeyKey = "com.alphonso.companion.voiceCloudApiKey"
    private let sessionAccount = "com.alphonso.companion.supabaseSession"
    private let deviceIDAccount = "com.alphonso.companion.voiceDeviceID"
    private let sessionID = UUID().uuidString
    private var audioPlayer: AVAudioPlayer?

    private var supabaseURL: String { Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String ?? "" }
    private var supabasePublishableKey: String { Bundle.main.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String ?? "" }

    override init() {
        let bundledEndpoint = Bundle.main.object(forInfoDictionaryKey: "CloudVoiceEndpoint") as? String
        let storedEndpoint = bundledEndpoint ?? UserDefaults.standard.string(forKey: endpointKey) ?? ""
        let securedKey = Self.loadAPIKey(account: apiKeyAccount)
        let legacyKey = UserDefaults.standard.string(forKey: legacyAPIKeyKey)
        let storedAPIKey = securedKey ?? legacyKey ?? ""

        endpoint = storedEndpoint
        apiKey = storedAPIKey
        let initialAuthenticationStatus = Self.loadSession(account: sessionAccount) == nil
            ? "Sign in to enable Cloud Voice"
            : "Cloud Voice account connected"
        authenticationStatus = initialAuthenticationStatus
        statusMessage = storedEndpoint.isEmpty ? "Cloud backend not configured" : initialAuthenticationStatus
        super.init()

        if securedKey == nil, let legacyKey, !legacyKey.isEmpty {
            Self.saveAPIKey(legacyKey, account: apiKeyAccount)
            UserDefaults.standard.removeObject(forKey: legacyAPIKeyKey)
        }
        // Provider access must not remain as an iPhone-held shared service key.
        Self.saveAPIKey("", account: apiKeyAccount)
        UserDefaults.standard.removeObject(forKey: legacyAPIKeyKey)
        apiKey = ""
    }

    func configure(endpoint: String, apiKey: String = "") {
        let trimmedEndpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        self.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEndpoint.isEmpty else {
            self.endpoint = ""
            UserDefaults.standard.removeObject(forKey: endpointKey)
            statusMessage = "Cloud backend not configured"
            Self.saveAPIKey(self.apiKey, account: apiKeyAccount)
            return
        }

        guard Self.isAcceptedCloudEndpoint(trimmedEndpoint) else {
            self.endpoint = ""
            UserDefaults.standard.removeObject(forKey: endpointKey)
            statusMessage = "Cloud backend URL is invalid"
            Self.saveAPIKey(self.apiKey, account: apiKeyAccount)
            return
        }

        self.endpoint = trimmedEndpoint
        UserDefaults.standard.set(self.endpoint, forKey: endpointKey)
        statusMessage = "Cloud backend ready"

        Self.saveAPIKey(self.apiKey, account: apiKeyAccount)
    }

    func submit(
        transcript: String,
        mode: VoiceMode,
        history: [VoiceCloudHistoryMessage],
        ttsModel: CloudTTSModel,
        language: String,
        agentID: String,
        piperVoice: String
    ) async throws -> VoiceCloudResponse {
        guard let url = URL(string: endpoint), !endpoint.isEmpty else {
            throw VoiceCloudError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await validAccessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(try deviceID(), forHTTPHeaderField: "X-Alphonso-Device-Id")

        let payload: [String: Any] = [
            "session_id": sessionID,
            "text": transcript,
            "mode": mode.rawValue,
            "tts_model": ttsModel.rawValue,
            "language": language,
            "agent_id": agentID,
            "piper_voice": piperVoice,
            "history": history.map { ["role": $0.role, "content": $0.content] }
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let dataResponse: (Data, URLResponse)
        do {
            dataResponse = try await URLSession.shared.data(for: request)
        } catch {
            throw VoiceCloudError.network(error.localizedDescription)
        }
        let (data, response) = dataResponse
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw VoiceCloudError.badResponse
        }

        let decoded: VoiceCloudResponse
        do {
            decoded = try JSONDecoder().decode(VoiceCloudResponse.self, from: data)
        } catch {
            throw VoiceCloudError.invalidPayload
        }

        return decoded
    }

    func requestEmailOTP(email: String) async throws {
        guard let url = URL(string: "\(supabaseURL)/auth/v1/otp"), !supabasePublishableKey.isEmpty else {
            throw VoiceCloudError.authNotConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "create_user": true])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw VoiceCloudError.authFailed
        }
        authenticationStatus = "Check your email for the sign-in code"
    }

    func verifyEmailOTP(email: String, code: String) async throws {
        guard let url = URL(string: "\(supabaseURL)/auth/v1/verify"), !supabasePublishableKey.isEmpty else {
            throw VoiceCloudError.authNotConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "token": code, "type": "email"])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw VoiceCloudError.authFailed
        }
        let session = try JSONDecoder().decode(SupabaseSession.self, from: data)
        try Self.saveSession(session, account: sessionAccount)
        try await enrollCurrentDevice(accessToken: session.accessToken)
        authenticationStatus = "Cloud Voice account connected"
        statusMessage = authenticationStatus
    }

    func signOut() {
        Self.saveSession(nil, account: sessionAccount)
        authenticationStatus = "Sign in to enable Cloud Voice"
        statusMessage = authenticationStatus
    }

    private func validAccessToken() async throws -> String {
        guard var session = Self.loadSession(account: sessionAccount) else { throw VoiceCloudError.signInRequired }
        if session.expiresAt.timeIntervalSinceNow < 60 {
            session = try await refresh(session)
            try Self.saveSession(session, account: sessionAccount)
        }
        return session.accessToken
    }

    private func refresh(_ session: SupabaseSession) async throws -> SupabaseSession {
        guard let url = URL(string: "\(supabaseURL)/auth/v1/token?grant_type=refresh_token") else { throw VoiceCloudError.authNotConfigured }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": session.refreshToken])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw VoiceCloudError.signInRequired }
        return try JSONDecoder().decode(SupabaseSession.self, from: data)
    }

    private func enrollCurrentDevice(accessToken: String) async throws {
        guard let url = URL(string: endpoint.replacingOccurrences(of: "/v1/voice/respond", with: "/v1/voice/devices/enroll")) else { throw VoiceCloudError.notConfigured }
        let id = try deviceID()
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["device_id": id, "display_name": UIDevice.current.name])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw VoiceCloudError.enrollmentFailed }
    }

    private func deviceID() throws -> String {
        if let existing = Self.loadAPIKey(account: deviceIDAccount), UUID(uuidString: existing) != nil { return existing }
        let id = UUID().uuidString
        Self.saveAPIKey(id, account: deviceIDAccount)
        return id
    }

    func play(_ response: VoiceCloudResponse) throws {
        guard let audioData = response.audioData else {
            throw VoiceCloudError.invalidPayload
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        audioPlayer?.stop()
        audioPlayer = try AVAudioPlayer(data: audioData)
        audioPlayer?.delegate = self
        audioPlayer?.prepareToPlay()
        guard audioPlayer?.play() == true else {
            audioPlayer = nil
            throw VoiceCloudError.playbackFailed
        }
        statusMessage = "Speaking cloud reply"
    }

    func stopPlayback() {
        audioPlayer?.stop()
        audioPlayer = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        onSpeakingEnded?()
    }

    private static func isAcceptedCloudEndpoint(_ value: String) -> Bool {
        guard let url = URL(string: value), !value.isEmpty else { return false }
#if DEBUG
        return url.scheme == "https" || url.host == "localhost" || url.host == "127.0.0.1"
#else
        return url.scheme == "https"
#endif
    }

    private static func loadAPIKey(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.alphonso.companion",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func saveAPIKey(_ value: String, account: String) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.alphonso.companion",
            kSecAttrAccount as String: account,
        ]
        if value.isEmpty {
            SecItemDelete(baseQuery as CFDictionary)
            return
        }
        let data = Data(value.utf8)
        let update = SecItemUpdate(baseQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecItemNotFound {
            var create = baseQuery
            create[kSecValueData as String] = data
            SecItemAdd(create as CFDictionary, nil)
        }
    }

    private static func loadSession(account: String) -> SupabaseSession? {
        guard let raw = loadAPIKey(account: account), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(SupabaseSession.self, from: data)
    }

    private static func saveSession(_ session: SupabaseSession?, account: String) {
        guard let session, let data = try? JSONEncoder().encode(session), let raw = String(data: data, encoding: .utf8) else {
            saveAPIKey("", account: account)
            return
        }
        saveAPIKey(raw, account: account)
    }
}

enum VoiceCloudError: LocalizedError {
    case notConfigured
    case badResponse
    case invalidPayload
    case network(String)
    case playbackFailed
    case authNotConfigured
    case authFailed
    case signInRequired
    case enrollmentFailed

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Cloud voice backend is not configured."
        case .badResponse:
            return "Cloud voice backend returned an unexpected response."
        case .invalidPayload:
            return "Cloud voice backend response could not be parsed."
        case .network(let message):
            return "Cloud voice network error: \(message)"
        case .playbackFailed:
            return "Cloud reply audio could not start."
        case .authNotConfigured:
            return "Cloud Voice sign-in is not configured in this app build."
        case .authFailed:
            return "Cloud Voice sign-in could not be completed."
        case .signInRequired:
            return "Sign in to Cloud Voice before sending a request."
        case .enrollmentFailed:
            return "This iPhone could not be enrolled for Cloud Voice."
        }
    }
}
