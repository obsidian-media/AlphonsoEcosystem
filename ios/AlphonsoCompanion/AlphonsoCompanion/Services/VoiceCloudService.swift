import AVFoundation
import Combine
import Foundation

struct VoiceCloudResponse: Decodable {
    let sessionID: String
    let agent: String
    let reply: String
    let audioBase64: String
    let state: String

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case agent
        case reply
        case audioBase64 = "audio_base64"
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
    private let apiKeyKey = "com.alphonso.companion.voiceCloudApiKey"
    private let sessionID = UUID().uuidString
    private var audioPlayer: AVAudioPlayer?

    init() {
        endpoint = UserDefaults.standard.string(forKey: endpointKey) ?? ""
        apiKey = UserDefaults.standard.string(forKey: apiKeyKey) ?? ""
        statusMessage = endpoint.isEmpty ? "Cloud backend not configured" : "Cloud backend ready"
    }

    func configure(endpoint: String, apiKey: String = "") {
        self.endpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        self.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)

        if self.endpoint.isEmpty {
            UserDefaults.standard.removeObject(forKey: endpointKey)
            statusMessage = "Cloud backend not configured"
        } else {
            UserDefaults.standard.set(self.endpoint, forKey: endpointKey)
            statusMessage = "Cloud backend ready"
        }

        if self.apiKey.isEmpty {
            UserDefaults.standard.removeObject(forKey: apiKeyKey)
        } else {
            UserDefaults.standard.set(self.apiKey, forKey: apiKeyKey)
        }
    }

    func submit(transcript: String, mode: VoiceMode, history: [VoiceTranscriptEntry]) async throws -> VoiceCloudResponse {
        guard let url = URL(string: endpoint), !endpoint.isEmpty else {
            throw VoiceCloudError.notConfigured
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let payload: [String: Any] = [
            "session_id": sessionID,
            "text": transcript,
            "mode": mode.rawValue,
            "history": history.map { entry in
                [
                    "speaker": entry.speaker.rawValue,
                    "text": entry.text,
                    "mode": entry.mode.rawValue,
                    "timestamp": ISO8601DateFormatter().string(from: entry.timestamp)
                ]
            }
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)
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
}

enum VoiceCloudError: LocalizedError {
    case notConfigured
    case badResponse
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Cloud voice backend is not configured."
        case .badResponse:
            return "Cloud voice backend returned an unexpected response."
        case .invalidPayload:
            return "Cloud voice backend response could not be parsed."
        }
    }
}
