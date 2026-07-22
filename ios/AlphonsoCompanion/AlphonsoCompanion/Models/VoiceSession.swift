import Combine
import Foundation
import SwiftUI

enum VoiceMode: String, CaseIterable, Codable, Identifiable {
    case local
    case cloud

    var id: String { rawValue }

    var title: String {
        switch self {
        case .local: return "Local"
        case .cloud: return "Cloud"
        }
    }

    var subtitle: String {
        switch self {
        case .local: return "Ollama on the local stack"
        case .cloud: return "Railway-backed cloud voice"
        }
    }

    var systemImage: String {
        switch self {
        case .local: return "internaldrive"
        case .cloud: return "cloud.fill"
        }
    }

    var accentColors: [Color] {
        switch self {
        case .local:
            return [Color.green.opacity(0.95), Color.teal.opacity(0.8)]
        case .cloud:
            return [Color.blue.opacity(0.95), Color.indigo.opacity(0.8)]
        }
    }
}

enum VoicePhase: String, Codable {
    case idle
    case listening
    case transcribing
    case sending
    case speaking
    case playbackFailed
}

enum VoiceSpeaker: String, Codable {
    case user
    case alphonso
}

enum VoiceLanguage: String, CaseIterable, Codable, Identifiable {
    case englishUS = "en-US"
    case spanishUS = "es-US"
    case frenchFR = "fr-FR"
    case germanDE = "de-DE"
    case japaneseJP = "ja-JP"
    case chineseCN = "zh-CN"
    case persianIR = "fa-IR"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .englishUS: return "English"
        case .spanishUS: return "Spanish"
        case .frenchFR: return "French"
        case .germanDE: return "German"
        case .japaneseJP: return "Japanese"
        case .chineseCN: return "Chinese"
        case .persianIR: return "Persian / Farsi"
        }
    }

    var subtitle: String {
        switch self {
        case .englishUS: return "English (United States)"
        case .spanishUS: return "Spanish (United States)"
        case .frenchFR: return "French (France)"
        case .germanDE: return "German (Germany)"
        case .japaneseJP: return "Japanese"
        case .chineseCN: return "Chinese (Simplified)"
        case .persianIR: return "Persian / Farsi (Iran)"
        }
    }

    var localeIdentifier: String { rawValue }
}

enum VoiceAgent: String, CaseIterable, Codable, Identifiable {
    case alphonso, jose, hector, miya, maria, marcus, echo, sentinel, nova
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum PiperFarsiVoice: String, CaseIterable, Codable, Identifiable {
    case mana, manta
    var id: String { rawValue }
    var title: String { rawValue == "mana" ? "Mana" : "Manta" }
}

enum VoiceReplyDelivery: String, Codable {
    case pendingPlayback
    case spoken
    case textOnly
}

enum CloudTTSModel: String, CaseIterable, Codable, Identifiable {
    case magpie
    case chatterbox

    var id: String { rawValue }

    var title: String {
        switch self {
        case .magpie: return "Magpie"
        case .chatterbox: return "Chatterbox"
        }
    }

    var subtitle: String {
        switch self {
        case .magpie: return "NVIDIA magpie-tts-multilingual"
        case .chatterbox: return "ResembleAI chatterbox-multilingual-tts"
        }
    }
}

struct VoiceTranscriptEntry: Identifiable, Codable {
    let id: UUID
    let speaker: VoiceSpeaker
    let text: String
    let mode: VoiceMode
    var delivery: VoiceReplyDelivery
    let timestamp: Date

    init(
        id: UUID = UUID(),
        speaker: VoiceSpeaker,
        text: String,
        mode: VoiceMode,
        delivery: VoiceReplyDelivery = .textOnly,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.speaker = speaker
        self.text = text
        self.mode = mode
        self.delivery = delivery
        self.timestamp = timestamp
    }
}

@MainActor
final class VoiceSessionViewModel: ObservableObject {
    @Published var mode: VoiceMode = .local
    @Published var phase: VoicePhase = .idle
    @Published var draftTranscript = ""
    @Published var transcript: [VoiceTranscriptEntry] = []
    @Published var statusMessage = "Ready for voice"
    @Published var permissionStatus = "Voice permissions not requested"
    @Published var cloudEndpoint = ""
    @Published var cloudAPIKey = ""
    @Published var cloudTTSModel: CloudTTSModel = .magpie
    @Published var piperFarsiVoice: PiperFarsiVoice = .mana
    @Published var cloudLanguage: VoiceLanguage = .englishUS
    @Published var selectedAgent: VoiceAgent = .alphonso
    @Published var cloudStatus = "Cloud backend not configured"
    @Published var cloudAuthStatus = "Sign in to enable Cloud Voice"
    @Published var isCloudAuthInFlight = false

    private let audioService = VoiceAudioService()
    private let cloudService = VoiceCloudService()
    private var localTranscriptSender: ((String, String, String) -> String?)?
    private var pendingLocalCommandID: String?
    private var lastSpokenMessageID: UUID?
    private var lastCloudResponse: VoiceCloudResponse?
    private var pendingCloudMessageID: UUID?
    private var cloudSubmissionTask: Task<Void, Never>?

    var providerTitle: String {
        switch mode {
        case .local: return "Ollama"
        case .cloud: return "Railway cloud"
        }
    }

    var phaseTitle: String {
        switch phase {
        case .idle: return "Idle"
        case .listening: return "Listening"
        case .transcribing: return "Transcribing"
        case .sending: return "Sending"
        case .speaking: return "Speaking"
        case .playbackFailed: return "Audio retry needed"
        }
    }

    var canSend: Bool {
        phase != .sending
            && !draftTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (mode != .cloud || cloudReady)
    }

    var canStartListening: Bool {
        mode != .cloud || cloudReady
    }

    init() {
        cloudEndpoint = cloudService.endpoint
        cloudAPIKey = cloudService.apiKey
        if let storedModel = UserDefaults.standard.string(forKey: "com.alphonso.companion.voiceCloudModel"),
           let model = CloudTTSModel(rawValue: storedModel) {
            cloudTTSModel = model
        }
        if let storedLanguage = UserDefaults.standard.string(forKey: "com.alphonso.companion.voiceCloudLanguage"),
           let language = VoiceLanguage(rawValue: storedLanguage) {
            cloudLanguage = language
        }
        if let storedAgent = UserDefaults.standard.string(forKey: "com.alphonso.companion.voiceAgent"),
           let agent = VoiceAgent(rawValue: storedAgent) {
            selectedAgent = agent
        }
        if let storedVoice = UserDefaults.standard.string(forKey: "com.alphonso.companion.piperFarsiVoice"),
           let voice = PiperFarsiVoice(rawValue: storedVoice) {
            piperFarsiVoice = voice
        }
        cloudStatus = cloudService.statusMessage
        cloudAuthStatus = cloudService.authenticationStatus
        bindAudioService()
    }

    func setLocalTranscriptSender(_ sender: @escaping (String, String, String) -> String?) {
        localTranscriptSender = sender
    }

    func configureCloudEndpoint(_ endpoint: String, apiKey: String = "") {
        cloudService.configure(endpoint: endpoint, apiKey: apiKey)
        cloudEndpoint = cloudService.endpoint
        cloudAPIKey = cloudService.apiKey
        cloudStatus = cloudService.statusMessage
    }

    func configureCloudTTSModel(_ model: CloudTTSModel) {
        cloudTTSModel = model
        UserDefaults.standard.set(model.rawValue, forKey: "com.alphonso.companion.voiceCloudModel")
        cloudStatus = "Cloud TTS set to \(model.title)"
    }

    func configureCloudLanguage(_ language: VoiceLanguage) {
        cloudLanguage = language
        UserDefaults.standard.set(language.rawValue, forKey: "com.alphonso.companion.voiceCloudLanguage")
        cloudStatus = "Cloud language set to \(language.title)"
    }

    func configureSelectedAgent(_ agent: VoiceAgent) {
        selectedAgent = agent
        UserDefaults.standard.set(agent.rawValue, forKey: "com.alphonso.companion.voiceAgent")
        statusMessage = "Talking to \(agent.title)"
    }

    func configurePiperFarsiVoice(_ voice: PiperFarsiVoice) {
        piperFarsiVoice = voice
        UserDefaults.standard.set(voice.rawValue, forKey: "com.alphonso.companion.piperFarsiVoice")
        cloudStatus = "Farsi voice set to \(voice.title)"
    }

    func requestCloudSignIn(email: String) {
        guard !isCloudAuthInFlight else { return }
        isCloudAuthInFlight = true
        Task {
            defer { isCloudAuthInFlight = false }
            do {
                try await cloudService.requestEmailOTP(email: email)
                cloudAuthStatus = cloudService.authenticationStatus
            } catch {
                cloudAuthStatus = error.localizedDescription
            }
        }
    }

    func completeCloudSignIn(email: String, code: String) {
        guard !isCloudAuthInFlight else { return }
        isCloudAuthInFlight = true
        Task {
            defer { isCloudAuthInFlight = false }
            do {
                try await cloudService.verifyEmailOTP(email: email, code: code)
                cloudAuthStatus = cloudService.authenticationStatus
                cloudStatus = cloudService.statusMessage
            } catch {
                cloudAuthStatus = error.localizedDescription
            }
        }
    }

    func signOutCloudVoice() {
        cloudSubmissionTask?.cancel()
        cloudSubmissionTask = nil
        cloudService.stopPlayback()
        cloudService.signOut()
        cloudAuthStatus = cloudService.authenticationStatus
        cloudStatus = cloudService.statusMessage
        lastCloudResponse = nil
        pendingCloudMessageID = nil
        if mode == .cloud {
            stopListening()
        }
    }

    var cloudReady: Bool { cloudAuthStatus == "Cloud Voice account connected" && !cloudEndpoint.isEmpty }

    func prepareForVoiceSession() {
        audioService.requestPermissions { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                self.permissionStatus = granted ? "Microphone ready" : "Microphone or speech access denied"
                self.statusMessage = granted ? "Ready for voice" : "Enable microphone access to talk"
            }
        }
    }

    func selectMode(_ mode: VoiceMode) {
        if phase == .listening {
            audioService.stopRecording()
        }
        cloudService.stopPlayback()
        self.mode = mode
        pendingLocalCommandID = nil
        phase = .idle
        statusMessage = "\(mode.title) mode selected"
    }

    func toggleListening() {
        if phase == .listening {
            stopListening()
        } else {
            startListening()
        }
    }

    func startListening() {
        guard canStartListening else {
            phase = .idle
            statusMessage = "Sign in to Cloud Voice before recording"
            cloudStatus = "Enroll this iPhone before using Cloud Voice"
            return
        }
        phase = .listening
        statusMessage = mode == .local
            ? "Listening for speech in local mode"
            : "Listening for speech to send to Railway"
        audioService.startRecording(locale: Locale(identifier: cloudLanguage.localeIdentifier))
    }

    func stopListening() {
        audioService.stopRecording()
        phase = .idle
        statusMessage = "Listening stopped"
    }

    func submitDraft() {
        guard canSend else { return }
        let trimmed = draftTranscript.trimmingCharacters(in: .whitespacesAndNewlines)

        transcript.append(
            VoiceTranscriptEntry(
                speaker: .user,
                text: trimmed,
                mode: mode
            )
        )
        draftTranscript = ""
        phase = .sending
        statusMessage = "Queued for \(providerTitle)"

        switch mode {
        case .local:
            guard let commandID = localTranscriptSender?(trimmed, selectedAgent.rawValue, cloudLanguage.rawValue) else {
                phase = .idle
                statusMessage = "Could not send to the paired desktop"
                return
            }
            pendingLocalCommandID = commandID
        case .cloud:
            cloudSubmissionTask = Task { [weak self] in
                guard let self else { return }
                await self.sendCloudTranscript(trimmed)
            }
        }
    }

    func ingestPartialTranscript(_ text: String) {
        draftTranscript = text
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            phase = .transcribing
            statusMessage = "Transcribing speech"
        }
    }

    func ingestFinalTranscript(_ text: String) {
        draftTranscript = text
        submitDraft()
    }

    func handleIncomingDesktopReply(_ message: Message) {
        guard mode == .local, message.isIncoming else { return }
        guard lastSpokenMessageID != message.id else { return }

        lastSpokenMessageID = message.id
        pendingLocalCommandID = nil
        appendAssistantReply(message.text, delivery: .spoken)
        phase = .speaking
        statusMessage = "Speaking reply through \(providerTitle)"
        audioService.speak(message.text)
    }

    func handleLocalCommandFailure(commandID: String, message: String) {
        guard pendingLocalCommandID == commandID else { return }
        pendingLocalCommandID = nil
        phase = .idle
        statusMessage = "Could not send to the paired desktop: \(message)"
    }

    @discardableResult
    func appendAssistantReply(_ text: String, delivery: VoiceReplyDelivery = .pendingPlayback) -> UUID {
        let entry = VoiceTranscriptEntry(
                speaker: .alphonso,
                text: text,
                mode: mode,
                delivery: delivery
            )
        transcript.append(entry)
        if delivery == .pendingPlayback {
            phase = .sending
            statusMessage = "Preparing spoken reply through \(providerTitle)"
        }
        return entry.id
    }

    func retryCloudPlayback() {
        guard let response = lastCloudResponse, let messageID = pendingCloudMessageID else { return }
        do {
            try cloudService.play(response)
            updateAssistantDelivery(messageID, to: .spoken)
            phase = .speaking
            statusMessage = "Speaking cloud reply"
            cloudStatus = cloudService.statusMessage
        } catch {
            updateAssistantDelivery(messageID, to: .textOnly)
            phase = .playbackFailed
            statusMessage = "Text reply is ready. Audio could not play — try again."
            cloudStatus = error.localizedDescription
        }
    }

    var canRetryPlayback: Bool { phase == .playbackFailed && lastCloudResponse != nil }

    func resetConversation() {
        cloudSubmissionTask?.cancel()
        cloudSubmissionTask = nil
        audioService.stopRecording()
        cloudService.stopPlayback()
        transcript.removeAll()
        draftTranscript = ""
        phase = .idle
        statusMessage = "Conversation cleared"
        lastSpokenMessageID = nil
        pendingLocalCommandID = nil
        lastCloudResponse = nil
        pendingCloudMessageID = nil
    }

    private func sendCloudTranscript(_ transcript: String) async {
        do {
            let response = try await cloudService.submit(
                transcript: transcript,
                mode: mode,
                history: cloudHistory(),
                ttsModel: cloudTTSModel,
                language: cloudLanguage.rawValue,
                agentID: selectedAgent.rawValue,
                piperVoice: piperFarsiVoice.rawValue
            )
            guard !Task.isCancelled, cloudReady else { return }
            let messageID = appendAssistantReply(response.reply)
            lastCloudResponse = response
            pendingCloudMessageID = messageID
            if response.language != cloudLanguage.rawValue,
               let normalized = VoiceLanguage(rawValue: response.language) {
                cloudLanguage = normalized
            }
            retryCloudPlayback()
        } catch {
            guard !Task.isCancelled else { return }
            statusMessage = error.localizedDescription
            phase = .idle
            cloudStatus = error.localizedDescription
        }
    }

    func cloudHistory() -> [VoiceCloudHistoryMessage] {
        transcript.dropLast().suffix(12).map { entry in
            VoiceCloudHistoryMessage(
                role: entry.speaker == .user ? "user" : "assistant",
                content: entry.text
            )
        }
    }

    private func updateAssistantDelivery(_ id: UUID, to delivery: VoiceReplyDelivery) {
        guard let index = transcript.firstIndex(where: { $0.id == id }) else { return }
        transcript[index].delivery = delivery
    }

    private func bindAudioService() {
        audioService.onPartialTranscript = { [weak self] text in
            Task { @MainActor in
                self?.ingestPartialTranscript(text)
            }
        }

        audioService.onFinalTranscript = { [weak self] text in
            Task { @MainActor in
                self?.ingestFinalTranscript(text)
            }
        }

        audioService.onError = { [weak self] message in
            Task { @MainActor in
                self?.statusMessage = message
                self?.phase = .idle
            }
        }

        audioService.onSpeakingEnded = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.phase == .speaking {
                    self.phase = .idle
                    self.statusMessage = "Ready for voice"
                }
            }
        }

        cloudService.onSpeakingEnded = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.phase == .speaking {
                    self.phase = .idle
                    self.statusMessage = "Ready for voice"
                }
            }
        }
    }
}
