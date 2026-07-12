import AVFoundation
import Combine
import Foundation
import Speech

enum VoiceAudioAuthorizationState: String {
    case unknown
    case requesting
    case authorized
    case denied
}

@MainActor
final class VoiceAudioService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var authorizationState: VoiceAudioAuthorizationState = .unknown
    @Published private(set) var statusMessage = "Ready"

    var onPartialTranscript: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?
    var onError: ((String) -> Void)?
    var onSpeakingEnded: (() -> Void)?

    private let audioEngine = AVAudioEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private var currentLocale = Locale(identifier: "en-US")
    private var micAuthorized = false
    private var speechAuthorized = false

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        authorizationState = .requesting

        let group = DispatchGroup()
        var microphoneGranted = false
        var speechGranted = false

        group.enter()
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            microphoneGranted = granted
            group.leave()
        }

        group.enter()
        SFSpeechRecognizer.requestAuthorization { status in
            speechGranted = status == .authorized
            group.leave()
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            self.micAuthorized = microphoneGranted
            self.speechAuthorized = speechGranted
            self.authorizationState = microphoneGranted && speechGranted ? .authorized : .denied
            self.statusMessage = microphoneGranted && speechGranted ? "Voice permissions ready" : "Voice permissions needed"
            completion(microphoneGranted && speechGranted)
        }
    }

    func startRecording(locale: Locale = Locale(identifier: "en-US")) {
        guard !isRecording else { return }
        currentLocale = locale

        if authorizationState != .authorized || !micAuthorized || !speechAuthorized {
            requestPermissions { [weak self] granted in
                guard let self else { return }
                if granted {
                    self.startRecording(locale: locale)
                } else {
                    self.onError?("Microphone or speech recognition is not authorized.")
                }
            }
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
            )
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            onError?(error.localizedDescription)
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil

        let recognizer = SFSpeechRecognizer(locale: locale)
        guard let recognizer else {
            onError?("Speech recognizer unavailable for this locale.")
            return
        }

        speechRecognizer = recognizer
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()

        do {
            try audioEngine.start()
        } catch {
            onError?(error.localizedDescription)
            stopRecording()
            return
        }

        isRecording = true
        statusMessage = "Listening"
        onPartialTranscript?("")

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let text = result.bestTranscription.formattedString
                DispatchQueue.main.async {
                    self.onPartialTranscript?(text)
                    self.statusMessage = result.isFinal ? "Captured speech" : "Listening"
                }

                if result.isFinal {
                    DispatchQueue.main.async {
                        self.onFinalTranscript?(text)
                    }
                    Task { @MainActor in
                        self.stopRecording()
                    }
                }
            }

            if let error {
                DispatchQueue.main.async {
                    self.onError?(error.localizedDescription)
                }
                Task { @MainActor in
                    self.stopRecording()
                }
            }
        }
    }

    func stopRecording() {
        guard isRecording || recognitionTask != nil else { return }

        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isRecording = false
        statusMessage = "Stopped"

        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            onError?(error.localizedDescription)
        }
    }

    func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: currentLocale.identifier)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.preUtteranceDelay = 0.08
        utterance.postUtteranceDelay = 0.08
        synthesizer.speak(utterance)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onSpeakingEnded?()
    }
}
