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

    func testCloudHistoryUsesRoleContentAndExcludesCurrentUserMessage() {
        let viewModel = VoiceSessionViewModel()
        viewModel.transcript = [
            VoiceTranscriptEntry(speaker: .user, text: "Earlier request", mode: .cloud),
            VoiceTranscriptEntry(speaker: .alphonso, text: "Earlier reply", mode: .cloud),
            VoiceTranscriptEntry(speaker: .user, text: "Current request", mode: .cloud),
        ]

        XCTAssertEqual(
            viewModel.cloudHistory(),
            [
                VoiceCloudHistoryMessage(role: "user", content: "Earlier request"),
                VoiceCloudHistoryMessage(role: "assistant", content: "Earlier reply"),
            ]
        )
    }

    func testCloudTTSModelConfigurationPersistsSelection() {
        let viewModel = VoiceSessionViewModel()

        viewModel.configureCloudTTSModel(.chatterbox)

        XCTAssertEqual(viewModel.cloudTTSModel, .chatterbox)
        XCTAssertEqual(viewModel.cloudStatus, "Cloud TTS set to Chatterbox")
    }

    func testCloudLanguageConfigurationPersistsSelection() {
        let viewModel = VoiceSessionViewModel()

        viewModel.configureCloudLanguage(.spanishUS)

        XCTAssertEqual(viewModel.cloudLanguage, .spanishUS)
        XCTAssertEqual(viewModel.cloudStatus, "Cloud language set to Spanish")
    }

    func testFarsiLanguageCanBeSelectedForTheNextTurn() {
        let viewModel = VoiceSessionViewModel()

        viewModel.configureCloudLanguage(.persianIR)

        XCTAssertEqual(viewModel.cloudLanguage, .persianIR)
    }

    func testSelectedAgentAndLanguageAreIncludedInLocalTranscriptContext() {
        let viewModel = VoiceSessionViewModel()
        var capturedAgentID: String?
        var capturedLanguage: String?
        viewModel.configureSelectedAgent(.maria)
        viewModel.configureCloudLanguage(.persianIR)
        viewModel.setLocalTranscriptSender { _, agentID, language in
            capturedAgentID = agentID
            capturedLanguage = language
        }

        viewModel.draftTranscript = "Review this risk"
        viewModel.submitDraft()

        XCTAssertEqual(capturedAgentID, "maria")
        XCTAssertEqual(capturedLanguage, "fa-IR")
    }

    func testCloudVoiceServerErrorPreservesSafeStatusAndReason() {
        let error = VoiceCloudError.server(status: 403, message: "This device is not enrolled for Cloud Voice")

        XCTAssertEqual(
            error.errorDescription,
            "Cloud Voice request failed (HTTP 403): This device is not enrolled for Cloud Voice"
        )
    }

    func testCloudVoiceServerErrorDoesNotRequireAResponseBody() {
        let error = VoiceCloudError.server(status: 502, message: "")

        XCTAssertEqual(error.errorDescription, "Cloud Voice request failed (HTTP 502).")
    }
}
