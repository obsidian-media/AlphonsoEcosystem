# Cloud Voice Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a stateless, Railway-deployable NVIDIA NIM voice service for iOS Cloud Voice while restoring an explicitly local-only Local Voice Gateway.

**Architecture:** `voice/cloud-backend` is a new FastAPI service with no imports from the local backend. It validates authenticated requests, calls NVIDIA NIM for text and NVIDIA TTS for WAV audio, then discards the request. The iOS app uses Keychain-backed credentials and role/content history. Existing `voice/backend` remains local and uses a configurable Ollama URL.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, httpx, pytest, Railway Railpack, SwiftUI, Security Keychain APIs, XCTest.

---

## File Structure

- Create: `voice/cloud-backend/app/config.py` - validated environment configuration and readiness.
- Create: `voice/cloud-backend/app/contracts.py` - strict API request/response models.
- Create: `voice/cloud-backend/app/auth.py` - fail-closed bearer authentication.
- Create: `voice/cloud-backend/app/nvidia.py` - NIM and provider-specific TTS clients.
- Create: `voice/cloud-backend/app/main.py` - HTTP routes and safe error mapping.
- Create: `voice/cloud-backend/tests/` - configuration, contract, provider, and API tests.
- Create: `voice/cloud-backend/requirements.txt`, `railway.json`, `.env.example`, and `RAILWAY_DEPLOYMENT.md`.
- Create: `ios/AlphonsoCompanion/AlphonsoCompanion/Services/VoiceCredentialStore.swift` - Keychain abstraction.
- Modify: `VoiceCloudService.swift`, `VoiceSession.swift`, `VoiceSessionViewModelTests.swift`, and the Xcode project.
- Modify: `voice/backend/pipeline.py`, `main.py`, associated tests, and `voice/README.md`.

### Task 1: Cloud Contracts and Configuration

**Files:** Create `voice/cloud-backend/app/config.py`, `contracts.py`, `tests/test_config.py`, and `tests/test_contracts.py`.

- [ ] **Step 1: Write failing tests for bounded requests and readiness.**

```python
def test_history_rejects_unknown_role():
    with pytest.raises(ValidationError):
        VoiceRequest(session_id="s", text="hello", history=[{"role": "system", "content": "x"}])

def test_missing_service_key_is_not_ready(monkeypatch):
    monkeypatch.delenv("VOICE_CLOUD_API_KEY", raising=False)
    assert Settings.from_env().is_ready is False
```

- [ ] **Step 2: Run `pytest voice/cloud-backend/tests/test_config.py voice/cloud-backend/tests/test_contracts.py -q`.** Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement models and settings.** `VoiceRequest` has `session_id` (1-128 chars), `text` (1-4,000 chars), 0-12 `ChatMessage` values with only `user`/`assistant` roles and 1-2,000 character content, one of the six iOS language codes, and `magpie`/`chatterbox`. `Settings` requires the service key, NVIDIA key, NIM URL/model, and both TTS URLs. Public readiness reports booleans only.

- [ ] **Step 4: Re-run the focused tests.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(voice): add cloud voice contracts"`

### Task 2: Authentication and NVIDIA Adapters

**Files:** Create `voice/cloud-backend/app/auth.py`, `nvidia.py`, `tests/test_auth.py`, and `tests/test_nvidia.py`.

- [ ] **Step 1: Write failing tests.**

```python
def test_bearer_auth_is_fail_closed():
    assert authenticate(None, "expected").status_code == 401
    assert authenticate("Bearer wrong", "expected").status_code == 403

async def test_magpie_uses_documented_multipart_fields(httpx_mock):
    await client.synthesize("hello", "en-US", "magpie")
    request = httpx_mock.get_request()
    assert b'name="encoding"' in request.content
    assert b'LINEAR_PCM' in request.content
```

- [ ] **Step 2: Run `pytest voice/cloud-backend/tests/test_auth.py voice/cloud-backend/tests/test_nvidia.py -q`.** Expected: FAIL.

- [ ] **Step 3: Implement.** NIM posts `model`, normalized `messages`, `max_tokens=320`, and `stream=false` to `NVIDIA_NIM_BASE_URL + /chat/completions` with the NVIDIA bearer key. Magpie submits `text`, `language`, configured `voice`, `encoding=LINEAR_PCM`, and `sample_rate_hz` as multipart data. Chatterbox has its own adapter and only provider-supported fields. Map 429, timeout, 5xx, malformed JSON, and empty audio to typed errors.

- [ ] **Step 4: Re-run focused tests.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(voice): add NVIDIA cloud providers"`

### Task 3: Railway API

**Files:** Create `voice/cloud-backend/app/main.py`, `requirements.txt`, `railway.json`, and `tests/test_api.py`.

- [ ] **Step 1: Write failing route tests.**

```python
def test_ready_is_503_when_configuration_is_missing(client):
    assert client.get("/ready").status_code == 503

def test_response_contains_wav_base64_and_timings(client, nvidia_mock):
    response = client.post("/v1/voice/respond", headers=AUTH, json=REQUEST)
    assert response.status_code == 200
    assert response.json()["audio_base64"]
    assert response.json()["timings_ms"]["total"] >= 0
```

- [ ] **Step 2: Run `pytest voice/cloud-backend/tests/test_api.py -q`.** Expected: FAIL.

- [ ] **Step 3: Implement `/health`, `/ready`, and authenticated `POST /v1/voice/respond`.** Append `ChatMessage(role="user", content=payload.text)` exactly once after normalized history, call NIM, call chosen TTS, and return request ID, text, base64 WAV, selected model/language, idle state, and non-sensitive timings. Map invalid input to 400, missing config/provider outage to 503, rate limit to 429, and unusable output to 502. Set Railway start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT` and its health check to `/ready`.

- [ ] **Step 4: Run `pytest voice/cloud-backend/tests -q; python -m py_compile voice/cloud-backend/app/*.py`.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(voice): add Railway cloud voice service"`

### Task 4: iOS Credential and API Contract Fixes

**Files:** Create `VoiceCredentialStore.swift`; modify `VoiceCloudService.swift`, `VoiceSession.swift`, tests, and Xcode project.

- [ ] **Step 1: Write failing tests for secure storage and normalized history.**

```swift
func testCloudHistoryUsesRoleAndContentAndExcludesCurrentDraft() {
    XCTAssertEqual(viewModel.cloudHistory().first?.role, "user")
}

func testCredentialStoreRoundTrip() throws {
    try store.save("secret")
    XCTAssertEqual(try store.load(), "secret")
}
```

- [ ] **Step 2: Run the `AlphonsoCompanion` XCTest target.** Expected: FAIL until Keychain storage and history mapping exist.

- [ ] **Step 3: Implement.** Keep endpoint storage in `UserDefaults`; move the API key to Keychain. Convert transcript entries to `{role, content}`, take the 12 most recent prior entries, and exclude the user message already supplied as `text`. Require HTTPS for non-debug configurations. Decode request ID, timings, and safe server error messages.

- [ ] **Step 4: Re-run the XCTest target.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "fix(ios): secure cloud voice credentials"`

### Task 5: Complete the Local Voice Gateway

**Files:** Modify `voice/backend/pipeline.py`, `main.py`, `tests/test_pipeline.py`, and `tests/test_main.py`.

- [ ] **Step 1: Write failing tests for `LOCAL_OLLAMA_URL` and local readiness.**

```python
async def test_ollama_url_uses_environment_override(monkeypatch, httpx_mock):
    monkeypatch.setenv("LOCAL_OLLAMA_URL", "http://lan-host:11434/api/chat")
    await collect(_call_ollama("s", "hi", "alphonso_core", []))
    assert str(httpx_mock.get_request().url).startswith("http://lan-host")
```

- [ ] **Step 2: Run `pytest voice/backend/tests/test_pipeline.py voice/backend/tests/test_main.py -q`.** Expected: FAIL.

- [ ] **Step 3: Implement.** Replace the hardcoded Ollama constant with `LOCAL_OLLAMA_URL` defaulting to localhost. Local health reports configured local host, actual Ollama reachability, STT readiness, and Piper readiness. Remove the cloud HTTP route and cloud configuration state from this local service.

- [ ] **Step 4: Run `pytest voice/backend/tests -q; python -m py_compile voice/backend/*.py`.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "fix(voice): isolate local gateway dependencies"`

### Task 6: Deployment Documentation and Final Verification

**Files:** Modify `voice/README.md`; create `.env.example` and `RAILWAY_DEPLOYMENT.md` under `voice/cloud-backend`.

- [ ] **Step 1: Document Railway service root, start command, variable names, Keychain-based app setup, readiness, and Magpie/Chatterbox selection.** Never include a secret value.

- [ ] **Step 2: Add names-only environment template.**

```dotenv
VOICE_CLOUD_API_KEY=
NVIDIA_API_KEY=
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=
NVIDIA_TTS_MAGPIE_URL=
NVIDIA_TTS_MAGPIE_DEFAULT_VOICE=
NVIDIA_TTS_CHATTERBOX_URL=
NVIDIA_TTS_CHATTERBOX_DEFAULT_VOICE=
```

- [ ] **Step 3: Run Python tests and compilation from Tasks 3 and 5, then run the XCTest target when Xcode/simulator are available.** Record any environment limitation precisely.

- [ ] **Step 4: Commit.** `git commit -m "docs(voice): add cloud voice deployment runbook"`

## Plan Self-Review

Every approved requirement maps to a task: isolated Railway deployment, NIM LLM, provider-specific TTS, stateless privacy, Keychain security, fail-closed authentication, local gateway repair, error semantics, and verification. No placeholders remain. Python and Swift API fields use the same names throughout the plan.
