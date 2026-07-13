import AVFoundation
import Combine
import Foundation
import Security

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

@MainActor
final class VoiceCloudService: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var endpoint: String
    @Published private(set) var apiKey: String
    @Published private(set) var statusMessage: String

    var onSpeakingEnded: (() -> Void)?

    private let endpointKey = "com.alphonso.companion.voiceCloudEndpoint"
    private let apiKeyAccount = "com.alphonso.companion.voiceCloudApiKey"
    private let legacyAPIKeyKey = "com.alphonso.companion.voiceCloudApiKey"
    private let sessionID = UUID().uuidString
    private var audioPlayer: AVAudioPlayer?

    override init() {
        let storedEndpoint = UserDefaults.standard.string(forKey: endpointKey) ?? ""
        let securedKey = Self.loadAPIKey(account: apiKeyAccount)
        let legacyKey = UserDefaults.standard.string(forKey: legacyAPIKeyKey)
        let storedAPIKey = securedKey ?? legacyKey ?? ""

        endpoint = storedEndpoint
        apiKey = storedAPIKey
        statusMessage = storedEndpoint.isEmpty ? "Cloud backend not configured" : "Cloud backend ready"
        super.init()

        if securedKey == nil, let legacyKey, !legacyKey.isEmpty {
            Self.saveAPIKey(legacyKey, account: apiKeyAccount)
            UserDefaults.standard.removeObject(forKey: legacyAPIKeyKey)
        }
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
        language: String
    ) async throws -> VoiceCloudResponse {
        guard let url = URL(string: endpoint), !endpoint.isEmpty else {
            throw VoiceCloudError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let payload: [String: Any] = [
            "session_id": sessionID,
            "text": transcript,
            "mode": mode.rawValue,
            "tts_model": ttsModel.rawValue,
            "language": language,
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
        audioPlayer?.play()
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
}

enum VoiceCloudError: LocalizedError {
    case notConfigured
    case badResponse
    case invalidPayload
    case network(String)

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
        }
    }
}
