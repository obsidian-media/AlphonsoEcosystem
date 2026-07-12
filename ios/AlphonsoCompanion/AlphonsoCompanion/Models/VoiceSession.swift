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
        case .cloud: return "Cloud voice with NVIDIA backending"
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
}

enum VoiceSpeaker: String, Codable {
    case user
    case alphonso
}

struct VoiceTranscriptEntry: Identifiable, Codable {
    let id: UUID
    let speaker: VoiceSpeaker
    let text: String
    let mode: VoiceMode
    let timestamp: Date

    init(
        id: UUID = UUID(),
        speaker: VoiceSpeaker,
        text: String,
        mode: VoiceMode,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.speaker = speaker
        self.text = text
        self.mode = mode
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

    private let audioService = VoiceAudioService()
    private var localTranscriptSender: ((String) -> Void)?
    private var lastSpokenMessageID: UUID?

    var providerTitle: String {
        switch mode {
        case .local: return "Ollama"
        case .cloud: return "NVIDIA cloud"
        }
    }

    var phaseTitle: String {
        switch phase {
        case .idle: return "Idle"
        case .listening: return "Listening"
        case .transcribing: return "Transcribing"
        case .sending: return "Sending"
        case .speaking: return "Speaking"
        }
    }

    var canSend: Bool {
        !draftTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init() {
        bindAudioService()
    }

    func setLocalTranscriptSender(_ sender: @escaping (String) -> Void) {
        localTranscriptSender = sender
    }

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
        self.mode = mode
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
        guard mode == .local else {
            statusMessage = "Cloud voice shell is ready for backend wiring"
            return
        }

        phase = .listening
        statusMessage = "Listening for speech in local mode"
        audioService.startRecording()
    }

    func stopListening() {
        audioService.stopRecording()
        phase = .idle
        statusMessage = "Listening stopped"
    }

    func submitDraft() {
        let trimmed = draftTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

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
            localTranscriptSender?(trimmed)
        case .cloud:
            appendAssistantReply("Cloud voice backend wiring is next.")
        }
    }

    func ingestPartialTranscript(_ text: String) {
        guard mode == .local else { return }
        draftTranscript = text
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            phase = .transcribing
            statusMessage = "Transcribing speech"
        }
    }

    func ingestFinalTranscript(_ text: String) {
        guard mode == .local else { return }
        draftTranscript = text
        submitDraft()
    }

    func handleIncomingDesktopReply(_ message: Message) {
        guard mode == .local, message.isIncoming else { return }
        guard lastSpokenMessageID != message.id else { return }

        lastSpokenMessageID = message.id
        appendAssistantReply(message.text)
        audioService.speak(message.text)
    }

    func appendAssistantReply(_ text: String) {
        transcript.append(
            VoiceTranscriptEntry(
                speaker: .alphonso,
                text: text,
                mode: mode
            )
        )
        phase = .speaking
        statusMessage = "Speaking reply through \(providerTitle)"
    }

    func resetConversation() {
        audioService.stopRecording()
        transcript.removeAll()
        draftTranscript = ""
        phase = .idle
        statusMessage = "Conversation cleared"
        lastSpokenMessageID = nil
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
    }
}
