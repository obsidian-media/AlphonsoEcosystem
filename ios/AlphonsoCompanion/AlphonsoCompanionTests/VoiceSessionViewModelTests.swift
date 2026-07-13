import XCTest
@testable import AlphonsoCompanion

@MainActor
final class VoiceSessionViewModelTests: XCTestCase {
    func testModeSwitchUpdatesStatusMessage() {
        let viewModel = VoiceSessionViewModel()

        viewModel.selectMode(.cloud)

        XCTAssertEqual(viewModel.mode, .cloud)
        XCTAssertEqual(viewModel.statusMessage, "Cloud mode selected")
    }

    func testSubmitDraftAppendsTranscriptAndClearsDraft() {
        let viewModel = VoiceSessionViewModel()
        viewModel.draftTranscript = "Hello Alphonso"

        viewModel.submitDraft()

        XCTAssertTrue(viewModel.draftTranscript.isEmpty)
        XCTAssertEqual(viewModel.transcript.count, 1)
        XCTAssertEqual(viewModel.transcript.first?.speaker, .user)
        XCTAssertEqual(viewModel.transcript.first?.text, "Hello Alphonso")
        XCTAssertEqual(viewModel.phase, .sending)
    }

    func testListeningLifecycleUpdatesPhase() {
        let viewModel = VoiceSessionViewModel()

        viewModel.startListening()
        XCTAssertEqual(viewModel.phase, .listening)

        viewModel.stopListening()
        XCTAssertEqual(viewModel.phase, .idle)
    }

    func testPartialTranscriptUpdatesDraftAndPhase() {
        let viewModel = VoiceSessionViewModel()

        viewModel.ingestPartialTranscript("Hello Alphonso")

        XCTAssertEqual(viewModel.draftTranscript, "Hello Alphonso")
        XCTAssertEqual(viewModel.phase, .transcribing)
    }

    func testIncomingDesktopReplyAppendsTranscript() {
        let viewModel = VoiceSessionViewModel()
        let reply = Message(text: "All set", isIncoming: true)

        viewModel.handleIncomingDesktopReply(reply)

        XCTAssertEqual(viewModel.transcript.count, 1)
        XCTAssertEqual(viewModel.transcript.first?.speaker, .alphonso)
        XCTAssertEqual(viewModel.transcript.first?.text, "All set")
    }

    func testCloudEndpointConfigurationUpdatesStatus() {
        let viewModel = VoiceSessionViewModel()

        viewModel.configureCloudEndpoint("https://voice.example.com/alphonso")

        XCTAssertEqual(viewModel.cloudEndpoint, "https://voice.example.com/alphonso")
        XCTAssertEqual(viewModel.cloudStatus, "Cloud backend ready")
    }

    func testCloudEndpointConfigurationStoresApiKey() {
        let viewModel = VoiceSessionViewModel()

        viewModel.configureCloudEndpoint(
            "https://voice.example.com/alphonso",
            apiKey: "secret-token"
        )

        XCTAssertEqual(viewModel.cloudAPIKey, "secret-token")
    }
}
