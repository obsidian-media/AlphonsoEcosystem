import Combine
import Foundation

/// Which of the two configured speakers is about to talk next. Live Translator is
/// explicitly sequential/push-to-talk (Google-Translate-conversation-mode pattern),
/// NOT simultaneous bidirectional interpretation -- see
/// docs/HANDOFF-alphonso-language-companion.md in the Boardroom repo for why that's
/// out of scope.
enum TranslatorTurn: String, Codable {
    case speakerA
    case speakerB
}

struct TranslatorTranscriptEntry: Identifiable, Codable {
    let id: UUID
    let turn: TranslatorTurn
    let spokenLanguage: VoiceLanguage
    let originalText: String
    let translatedLanguage: VoiceLanguage
    let translatedText: String
    var delivery: VoiceReplyDelivery
    let timestamp: Date

    init(
        id: UUID = UUID(),
        turn: TranslatorTurn,
        spokenLanguage: VoiceLanguage,
        originalText: String,
        translatedLanguage: VoiceLanguage,
        translatedText: String,
        delivery: VoiceReplyDelivery = .textOnly,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.turn = turn
        self.spokenLanguage = spokenLanguage
        self.originalText = originalText
        self.translatedLanguage = translatedLanguage
        self.translatedText = translatedText
        self.delivery = delivery
        self.timestamp = timestamp
    }
}

/// The backend agent id for Live Translator. Deliberately a plain string rather than
/// a new `VoiceAgent` case -- `VoiceAgent` backs the existing chat-agent picker used
/// by Local/Cloud voice chat, and Translator isn't a chat agent a user picks from
/// that list, it's a distinct mode with its own view. `VoiceCloudService.submit`
/// already accepts `agentID` as a raw `String`, so no changes to `VoiceCloudService`
/// or `VoiceAgent` are needed. Must match `id: "translator"` in
/// `voice/shared/voice_policy.json`.
private let translatorAgentID = "translator"

/// Which speaker is treated as the device owner (the authenticated learner
/// whose speech feeds the weakness-detection pipeline) -- Speaker A, by
/// explicit product decision, not an inferred default. The UI has no "which
/// one is me" concept (Speaker A/B are symmetric labels), so this is a real,
/// stated convention: Speaker A's language is always the tracked practice
/// language. Speaker B's speech is never analyzed or stored -- they're not a
/// user of this app and there's no consent basis to profile their speech.
/// If Speaker A doesn't reliably end up as the device owner in practice
/// (e.g. `swapTurn` is used to let the other person start), the real fix is
/// a proper "I speak" picker in the UI, not changing this constant.
private let ownSpeaker: TranslatorTurn = .speakerA

@MainActor
final class TranslatorViewModel: ObservableObject {
    @Published var languageA: VoiceLanguage = .englishUS
    @Published var languageB: VoiceLanguage = .spanishUS
    @Published var currentTurn: TranslatorTurn = .speakerA
    @Published var phase: VoicePhase = .idle
    @Published var draftTranscript = ""
    @Published var transcript: [TranslatorTranscriptEntry] = []
    @Published var statusMessage = "Ready to translate"
    @Published var permissionStatus = "Voice permissions not requested"

    private let audioService = VoiceAudioService()
    private var cloudService = VoiceCloudService()
    private var lastCloudResponse: VoiceCloudResponse?
    private var pendingEntryID: UUID?
    private var submissionTask: Task<Void, Never>?

    var speakingLanguage: VoiceLanguage {
        currentTurn == .speakerA ? languageA : languageB
    }

    var targetLanguage: VoiceLanguage {
        currentTurn == .speakerA ? languageB : languageA
    }

    var phaseTitle: String {
        switch phase {
        case .idle: return "Idle"
        case .listening: return "Listening"
        case .transcribing: return "Transcribing"
        case .sending: return "Translating"
        case .speaking: return "Speaking translation"
        case .playbackFailed: return "Audio retry needed"
        }
    }

    var canStartListening: Bool { cloudReady }

    var cloudReady: Bool {
        cloudService.authenticationStatus == "Cloud Voice account connected" && !cloudService.endpoint.isEmpty
    }

    var canRetryPlayback: Bool { phase == .playbackFailed && lastCloudResponse != nil }

    init() {
        bindAudioService()
    }

    /// Adopt the app-level shared `VoiceCloudService` instance -- same reasoning as
    /// `VoiceSessionViewModel.attach(cloudService:)`: without this, magic-link sign-in
    /// completed on the app-level instance is invisible to a view model that created
    /// its own `VoiceCloudService` independently at init.
    func attach(cloudService: VoiceCloudService) {
        guard self.cloudService !== cloudService else { return }
        self.cloudService = cloudService
        cloudService.onSpeakingEnded = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.phase == .speaking {
                    self.phase = .idle
                    self.statusMessage = "Ready to translate"
                }
            }
        }
    }

    func prepareForSession() {
        audioService.requestPermissions { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                self.permissionStatus = granted ? "Microphone ready" : "Microphone or speech access denied"
                self.statusMessage = granted ? "Ready to translate" : "Enable microphone access to talk"
            }
        }
    }

    func swapTurn(to turn: TranslatorTurn) {
        guard phase == .idle else { return }
        currentTurn = turn
        statusMessage = "\(turn == .speakerA ? "Speaker A" : "Speaker B") will speak \(speakingLanguage.title)"
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
            return
        }
        phase = .listening
        statusMessage = "Listening in \(speakingLanguage.title)"
        audioService.startRecording(locale: Locale(identifier: speakingLanguage.localeIdentifier))
    }

    func stopListening() {
        audioService.stopRecording()
        phase = .idle
        statusMessage = "Listening stopped"
    }

    func retryCloudPlayback() {
        guard let response = lastCloudResponse, let entryID = pendingEntryID else { return }
        do {
            try cloudService.play(response)
            updateDelivery(entryID, to: .spoken)
            phase = .speaking
            statusMessage = "Speaking translation"
        } catch {
            updateDelivery(entryID, to: .textOnly)
            phase = .playbackFailed
            statusMessage = "Translation text is ready. Audio could not play -- try again."
        }
    }

    func resetConversation() {
        submissionTask?.cancel()
        submissionTask = nil
        audioService.stopRecording()
        cloudService.stopPlayback()
        analyzeOwnUtterancesForLessonContextIfNeeded()
        transcript.removeAll()
        draftTranscript = ""
        phase = .idle
        currentTurn = .speakerA
        statusMessage = "Conversation cleared"
        lastCloudResponse = nil
        pendingEntryID = nil
    }

    /// Feeds the device owner's own utterances from this Translator session
    /// into the offline weakness-detection pipeline -- the same "your real
    /// conversations become your curriculum" loop as
    /// `VoiceSessionViewModel`'s Tutor-side wiring (see that file's own
    /// comment for the fuller rationale), extended to Translator sessions:
    /// a Translator conversation is real language production too, not just
    /// the Tutor chat.
    ///
    /// Deliberately filters to `ownSpeaker`'s turns only -- see that
    /// constant's comment for why Speaker B's speech is excluded entirely,
    /// not just deprioritized. `originalText` (what Speaker A actually said,
    /// mistakes included), not `translatedText`, is what gets analyzed --
    /// the translation is a faithful rendering into the OTHER language and
    /// carries no signal about Speaker A's own production.
    private func analyzeOwnUtterancesForLessonContextIfNeeded() {
        guard cloudReady else { return }
        let ownUtterances = transcript.filter { $0.turn == ownSpeaker }
        guard ownUtterances.count > 1 else { return }
        let language = languageA.rawValue
        let sessionTranscript = ownUtterances.map { entry in
            VoiceCloudHistoryMessage(role: "user", content: entry.originalText)
        }
        Task { [cloudService] in
            _ = try? await cloudService.analyzeSession(language: language, transcript: sessionTranscript)
        }
    }

    private func ingestFinalTranscript(_ text: String) {
        draftTranscript = text
        submitForTranslation(text)
    }

    private func submitForTranslation(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            phase = .idle
            return
        }
        let turn = currentTurn
        let from = speakingLanguage
        let to = targetLanguage
        draftTranscript = ""
        phase = .sending
        statusMessage = "Translating \(from.title) -> \(to.title)"

        submissionTask = Task { [weak self] in
            guard let self else { return }
            await self.sendForTranslation(text: trimmed, turn: turn, from: from, to: to)
        }
    }

    private func sendForTranslation(text: String, turn: TranslatorTurn, from: VoiceLanguage, to: VoiceLanguage) async {
        do {
            // No shared conversation history is sent -- each translation turn must
            // stand alone (`voice_policy.json`'s translator persona explicitly forbids
            // answering on behalf of the speaker or adding context from prior turns).
            let response = try await cloudService.submit(
                transcript: text,
                mode: .cloud,
                history: [],
                ttsModel: .magpie,
                language: to.rawValue,
                agentID: translatorAgentID,
                piperVoice: "mana"
            )
            guard !Task.isCancelled, cloudReady else { return }

            let entry = TranslatorTranscriptEntry(
                turn: turn,
                spokenLanguage: from,
                originalText: text,
                translatedLanguage: to,
                translatedText: response.reply
            )
            transcript.append(entry)
            pendingEntryID = entry.id
            lastCloudResponse = response
            retryCloudPlayback()

            // Sequential mode: the *other* speaker responds next, in their own language.
            currentTurn = (turn == .speakerA) ? .speakerB : .speakerA
        } catch {
            guard !Task.isCancelled else { return }
            statusMessage = error.localizedDescription
            phase = .idle
        }
    }

    private func updateDelivery(_ id: UUID, to delivery: VoiceReplyDelivery) {
        guard let index = transcript.firstIndex(where: { $0.id == id }) else { return }
        transcript[index].delivery = delivery
    }

    private func bindAudioService() {
        audioService.onPartialTranscript = { [weak self] text in
            Task { @MainActor in
                guard let self else { return }
                self.draftTranscript = text
                if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.phase = .transcribing
                }
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
                    self.statusMessage = "Ready to translate"
                }
            }
        }
    }
}
