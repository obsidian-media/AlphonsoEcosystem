# Voice Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable iOS push-to-talk conversations with spoken Local and Cloud replies, explicit nine-agent personas, and English/Farsi turn switching.

**Architecture:** iOS owns turn state, locale selection, transcript and playback. The desktop companion protocol carries voice context into the existing Jose pipeline; Cloud Voice builds a constrained prompt and chooses NVIDIA or Azure synthesis by locale. Existing agent contracts remain authoritative for Local execution.

**Tech Stack:** SwiftUI, Speech, AVFoundation, Tauri/Rust, React/TypeScript, FastAPI/Pydantic/httpx, Azure Speech REST, pytest, XCTest.

---

## File structure

- Create `voice/shared/voice_policy.json`: language-neutral response rules and the nine display/persona profiles.
- Create `voice/cloud-backend/app/voice_policy.py`: validates a profile and builds Cloud system messages.
- Create `voice/cloud-backend/app/azure_tts.py`: Azure REST adapter for `fa-IR`.
- Modify Cloud contracts/config/main/NVIDIA client for typed voice context and provider routing.
- Modify iOS VoiceSession, VoiceAudioService, VoiceCloudService, WebSocketService and VoiceView for selection, capability checks, playback retry, and UI.
- Modify `src-tauri/src/companion_router.rs` and `src/App.tsx` to preserve local voice metadata.

### Task 1: Add shared voice policy and profile data

**Files:**
- Create: `voice/shared/voice_policy.json`
- Create: `voice/cloud-backend/app/voice_policy.py`
- Test: `voice/cloud-backend/tests/test_voice_policy.py`

- [ ] **Step 1: Write the failing policy tests**

```python
from app.voice_policy import build_system_message, get_voice_agent

def test_alphonso_farsi_policy_is_concise_and_localized():
    message = build_system_message(agent_id="alphonso", language="fa-IR")
    assert "Persian (fa-IR)" in message
    assert "just a language model" in message
    assert get_voice_agent("alphonso").display_name == "Alphonso"

def test_unknown_agent_is_rejected():
    assert get_voice_agent("unknown") is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest voice/cloud-backend/tests/test_voice_policy.py -q`

Expected: FAIL because `app.voice_policy` does not exist.

- [ ] **Step 3: Create the policy data and loader**

Create policy rules requiring concise spoken responses, selected-language replies, no generic-model self-description, and no claims of executed actions. Define the stable IDs `alphonso`, `jose`, `miya`, `hector`, `maria`, `marcus`, `echo`, `sentinel`, and `nova` with display name, role summary, and voice persona. Do not place allowed/blocked actions in this file.

```python
def build_system_message(agent_id: str, language: str) -> str:
    agent = get_voice_agent(agent_id)
    if agent is None:
        raise VoicePolicyError("Unknown voice agent")
    return "\n".join([
        f"You are {agent.display_name}.",
        f"Role: {agent.role_summary}",
        f"Voice persona: {agent.voice_persona}",
        f"Reply language: {language_label(language)}.",
        *policy_rules(),
    ])
```

- [ ] **Step 4: Run tests and commit**

Run: `python -m pytest voice/cloud-backend/tests/test_voice_policy.py -q`

Expected: PASS.

```bash
git add voice/shared/voice_policy.json voice/cloud-backend/app/voice_policy.py voice/cloud-backend/tests/test_voice_policy.py
git commit -m "feat(voice): add shared conversation policy"
```

### Task 2: Extend the Cloud Voice contract

**Files:**
- Modify: `voice/cloud-backend/app/contracts.py`
- Modify: `voice/cloud-backend/tests/test_contracts.py`
- Modify: `voice/cloud-backend/tests/test_api.py`

- [ ] **Step 1: Write failing validation tests**

```python
def test_request_accepts_farsi_and_selected_agent():
    request = VoiceRequest(session_id="s", text="سلام", language="fa-IR", agent_id="maria")
    assert request.agent_id == "maria"

def test_request_rejects_unknown_agent_and_language():
    with pytest.raises(ValidationError):
        VoiceRequest(session_id="s", text="hello", language="it-IT", agent_id="nope")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest voice/cloud-backend/tests/test_contracts.py -q`

Expected: FAIL because `agent_id` and `fa-IR` are absent.

- [ ] **Step 3: Add exact fields**

```python
agent_id: Literal["alphonso", "jose", "miya", "hector", "maria", "marcus", "echo", "sentinel", "nova"] = "alphonso"
language: Literal["en-US", "es-US", "fr-FR", "de-DE", "ja-JP", "zh-CN", "fa-IR"] = "en-US"
```

Add `tts_provider: Literal["nvidia", "azure"]` to `VoiceResponse`; return the requested agent ID rather than the hard-coded agent value.

- [ ] **Step 4: Run tests and commit**

Run: `python -m pytest voice/cloud-backend/tests/test_contracts.py voice/cloud-backend/tests/test_api.py -q`

Expected: PASS.

```bash
git add voice/cloud-backend/app/contracts.py voice/cloud-backend/tests/test_contracts.py voice/cloud-backend/tests/test_api.py
git commit -m "feat(voice): carry agent and language context"
```

### Task 3: Implement Cloud persona prompts and Azure Farsi synthesis

**Files:**
- Create: `voice/cloud-backend/app/azure_tts.py`
- Modify: `voice/cloud-backend/app/config.py`
- Modify: `voice/cloud-backend/app/main.py`
- Modify: `voice/cloud-backend/app/nvidia.py`
- Modify: `voice/cloud-backend/.env.example`
- Test: `voice/cloud-backend/tests/test_api.py`

- [ ] **Step 1: Write failing provider-routing tests**

```python
@patch("app.main.AzureTTSClient.synthesize", new=AsyncMock(return_value=b"RIFFazure"))
@patch("app.main.NvidiaClient.complete", new=AsyncMock(return_value="سلام"))
def test_farsi_uses_azure_tts(...):
    response = TestClient(app).post(..., json={"session_id": "s", "text": "سلام", "language": "fa-IR"})
    assert response.json()["tts_provider"] == "azure"
```

Also test a missing Azure configuration returns HTTP 503, not an empty audio payload.

- [ ] **Step 2: Run test to verify failure**

Run: `python -m pytest voice/cloud-backend/tests/test_api.py -q`

Expected: FAIL because no Azure adapter or provider field exists.

- [ ] **Step 3: Implement the Azure adapter and explicit routing**

Read `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and `AZURE_TTS_FARSI_VOICE` (default `fa-IR-DilaraNeural`). Use httpx to POST SSML to Azure Speech with `Ocp-Apim-Subscription-Key` and `X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm`. Reject empty/non-RIFF audio.

```python
messages = [{"role": "system", "content": build_system_message(payload.agent_id, payload.language)}]
messages.extend(message.model_dump() for message in payload.history)
messages.append({"role": "user", "content": payload.text})
reply = await client.complete(messages)
if payload.language == "fa-IR":
    audio, provider = await azure.synthesize(reply), "azure"
else:
    audio, provider = await client.synthesize(reply, payload.language, payload.tts_model), "nvidia"
```

Change `NvidiaClient.complete` to accept the complete message list and remove its duplicate user-message construction.

- [ ] **Step 4: Run tests and commit**

Run: `python -m pytest voice/cloud-backend/tests -q`

Expected: PASS.

```bash
git add voice/cloud-backend
git commit -m "feat(voice): route Farsi synthesis through Azure"
```

### Task 4: Preserve selected agent and language in Local mode

**Files:**
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Services/WebSocketService.swift`
- Modify: `src-tauri/src/companion_router.rs`
- Modify: `src/App.tsx`
- Test: `src-tauri/src/companion_router.rs` inline tests and `src/test/joseExecutionEngineService.test.js`

- [ ] **Step 1: Write a failing Rust metadata test**

```rust
#[test]
fn voice_command_payload_preserves_agent_and_language() {
  let payload = voice_command_payload("hello", "maria", "fa-IR");
  assert_eq!(payload["agentId"], "maria");
  assert_eq!(payload["language"], "fa-IR");
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cargo test companion_router::tests::voice_command_payload_preserves_agent_and_language`

Expected: FAIL because voice metadata is not serialized.

- [ ] **Step 3: Add typed context and preserve it exactly**

```ts
type CompanionVoiceCommand = {
  commandId: string;
  text: string;
  agentId: string;
  language: string;
  voiceConversation: boolean;
};
```

Make the Swift sender include the fields in JSON-RPC `params`. Rust validates one of the nine IDs (legacy messages default to `alphonso` and `en-US`) and emits the same fields. The React listener passes `requestedAgent` and `conversationLanguage` to `runJoseCommandExecutionPipeline`, without changing `validateAgentExecutionContract` or policy-gate behavior.

- [ ] **Step 4: Run tests and commit**

Run: `cd src-tauri; cargo test companion_router; cd ..; npm run test -- --run src/test/joseExecutionEngineService.test.js`

Expected: PASS.

```bash
git add src-tauri/src/companion_router.rs src/App.tsx ios/AlphonsoCompanion/AlphonsoCompanion/Services/WebSocketService.swift
git commit -m "feat(voice): preserve local agent and language context"
```

### Task 5: Add iOS agent selection, Farsi, and recognition capability checks

**Files:**
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Models/VoiceSession.swift`
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Services/VoiceAudioService.swift`
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Views/VoiceView.swift`
- Test: `ios/AlphonsoCompanion/AlphonsoCompanionTests/VoiceSessionViewModelTests.swift`

- [ ] **Step 1: Write failing XCTest cases**

```swift
func testFarsiLanguageCanBeSelectedForTheNextTurn() {
    let viewModel = VoiceSessionViewModel()
    viewModel.configureCloudLanguage(.persianIR)
    XCTAssertEqual(viewModel.cloudLanguage, .persianIR)
}

func testSelectedAgentIsSentWithLocalTranscript() {
    let viewModel = VoiceSessionViewModel()
    viewModel.selectAgent(.maria)
    var context: VoiceCommandContext?
    viewModel.setLocalTranscriptSender { _, value in context = value }
    viewModel.draftTranscript = "Review this risk"
    viewModel.submitDraft()
    XCTAssertEqual(context?.agentID, "maria")
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `xcodebuild test -project ios/AlphonsoCompanion/AlphonsoCompanion.xcodeproj -scheme AlphonsoCompanion -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:AlphonsoCompanionTests/VoiceSessionViewModelTests`

Expected: FAIL because Farsi, voice agents, and local voice context do not exist.

- [ ] **Step 3: Implement state and UI**

Define `VoiceAgent` with nine stable IDs, names, and role summaries; default it to Alphonso. Add `case persianIR = "fa-IR"` to `VoiceLanguage`. Add an agent picker above mode and retain the language picker for reliable per-turn switching.

```swift
func canRecognize(locale: Locale) -> Bool {
    SFSpeechRecognizer.supportedLocales().contains { $0.identifier == locale.identifier }
}
```

Before recording, block unavailable locales and set a specific idle error. Include selected agent/language in Local and Cloud request contexts.

- [ ] **Step 4: Run test and commit**

Run: the Task 5 xcodebuild command.

Expected: PASS.

```bash
git add ios/AlphonsoCompanion
git commit -m "feat(ios): add voice agent and Farsi turn selection"
```

### Task 6: Make Cloud playback truthful and retryable

**Files:**
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Services/VoiceCloudService.swift`
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Models/VoiceSession.swift`
- Test: `ios/AlphonsoCompanion/AlphonsoCompanionTests/VoiceSessionViewModelTests.swift`

- [ ] **Step 1: Write a failing playback-failure test**

```swift
func testInvalidCloudAudioLeavesReplyVisibleAndSetsPlaybackFailure() async {
    let viewModel = VoiceSessionViewModel(cloudService: StubCloudService(response: .invalidAudio))
    viewModel.draftTranscript = "Hello"
    viewModel.submitDraft()
    await fulfillment(of: [viewModel.replyCompletedExpectation], timeout: 1)
    XCTAssertEqual(viewModel.transcript.last?.speaker, .alphonso)
    XCTAssertEqual(viewModel.phase, .failed)
}
```

- [ ] **Step 2: Run test to verify failure**

Run: the Task 5 xcodebuild command.

Expected: FAIL because concrete services cannot be stubbed and playback errors overwrite the response state.

- [ ] **Step 3: Add protocol injection and retained audio**

Make `VoiceCloudService` conform to a protocol covering submit/play/stop. Append reply text before attempting playback; retain decodable audio. Only enter `.speaking` after `AVAudioPlayer.play()` succeeds. On audio/decode failure, enter `.failed`, preserve the reply, and expose `retryCloudPlayback()` when audio is retained.

- [ ] **Step 4: Run test and commit**

Run: the Task 5 xcodebuild command.

Expected: PASS.

```bash
git add ios/AlphonsoCompanion/AlphonsoCompanion/Services/VoiceCloudService.swift ios/AlphonsoCompanion/AlphonsoCompanion/Models/VoiceSession.swift ios/AlphonsoCompanion/AlphonsoCompanionTests/VoiceSessionViewModelTests.swift
git commit -m "fix(ios): report cloud voice playback failures"
```

### Task 7: Document deployment and perform verification

**Files:**
- Modify: `voice/cloud-backend/RAILWAY_DEPLOYMENT.md`
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/README.md`

- [ ] **Step 1: Document exact configuration**

Document `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and `AZURE_TTS_FARSI_VOICE`; document `agent_id` input and `tts_provider` output. Never commit credentials.

- [ ] **Step 2: Run all automated verification**

Run: `python -m pytest voice/cloud-backend/tests -q`

Expected: PASS.

Run: `npm run lint && npm run test -- --run src/test/joseExecutionEngineService.test.js`

Expected: PASS with no new lint errors.

Run: `cd src-tauri; cargo test companion_router; cargo clippy -- -D warnings`

Expected: PASS.

- [ ] **Step 3: Perform physical-device acceptance after variables are provisioned**

For one authenticated English/NVIDIA and one authenticated Farsi/Azure request, verify HTTP success, non-empty RIFF audio, correct `agent`, `language`, and `tts_provider`, then confirm playback on a physical iPhone. Record only timestamp, response status, provider, and pass/fail result.

- [ ] **Step 4: Commit documentation**

```bash
git add voice/cloud-backend/RAILWAY_DEPLOYMENT.md ios/AlphonsoCompanion/AlphonsoCompanion/README.md
git commit -m "docs(voice): document multilingual deployment checks"
```

## Self-review

- Spec coverage: Tasks 1-7 cover shared speech behavior, nine personas, both transports, Farsi routing, capability/error states, tests, and deployment evidence.
- Placeholder scan: no implementation step is deferred; real provider credentials are intentionally deployment configuration.
- Type consistency: `agent_id`/agent ID, `language`, `VoiceCommandContext`, `tts_provider`, and `fa-IR` are introduced before consumers.

