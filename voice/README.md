# Alphonso Voice OS

Real-time interruptible full-duplex voice agent system.

## Pipeline

```
Microphone → [WebRTC VAD] → [Whisper STT] → [Ollama LLM] → [Piper TTS] → Speaker
                          ↑ barge-in interrupts at any state ↑
```

## Requirements

- Python 3.11+
- [Ollama](https://ollama.com) running locally on port 11434 with at least one model pulled
- Docker + Docker Compose (for containerised mode)
- Node.js 20+ (for frontend dev mode)

## Quick Start

### 1. Download voice model

```bash
mkdir -p backend/voices
curl -L -o backend/voices/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o backend/voices/en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### 2. Run with Docker Compose

```bash
docker-compose up
```

Backend at http://localhost:8000 · Frontend at http://localhost:5174

### 3. Run locally (dev)

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODEL` | `llama3` | Ollama model name to use |
| `WHISPER_MODEL` | `base` | Whisper model size (tiny/base/small/medium) |
| `BUFFER_THRESHOLD_BYTES` | `32000` | PCM bytes before processing (~1s) |
| `VITE_VOICE_WS_URL` | `ws://localhost:8000/ws` | WebSocket URL for frontend |

## Agent Routing

Voice input is automatically routed to the correct agent based on keywords:

| Phrase | Agent |
|---|---|
| "search for...", "find...", "what is..." | Hector (Research) |
| "write...", "draft...", "create..." | Miya (Content) |
| "publish...", "post...", "share..." | Marcus (Distribution) |
| "remember...", "recall..." | Echo (Memory) |
| "task...", "assign...", "schedule..." | Jose (Tasks) |
| "security...", "scan...", "vulnerability..." | Sentinel (Security) |
| "opportunity...", "analyse..." | Nova (Analysis) |
| "policy...", "compliance..." | Maria (Governance) |
| (everything else) | Alphonso Core |

## Backend Architecture

```
main.py         WebSocket server, barge-in, session management
pipeline.py     Core async generator: VAD → STT → LLM → TTS
vad.py          WebRTC VAD (30ms frame analysis, 30% threshold)
stt.py          faster-whisper, base model, cpu+int8, lru_cache
tts.py          piper-tts, async via ThreadPoolExecutor
router.py       Regex-based intent → agent mapping
session.py      Per-session asyncio.Task registry
state.py        Per-session VoiceState dict
```

---

## Testing Checklist (acceptance gate before handing back)

The reviewer (Claude Code) will verify every item below. If any fails, the handoff is incomplete.

### Backend (run from `voice/backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Write `voice/backend/tests/` with at minimum:

| Test file | What to test |
|---|---|
| `test_vad.py` | `is_speech(b"")` → False; `is_speech(silent_bytes)` → False; `is_speech(speech_bytes)` → True |
| `test_stt.py` | `transcribe(b"")` → `""`; model loads without error; output is `str` |
| `test_router.py` | Each of the 8 keyword patterns routes to the correct agent; default routes to `alphonso_core` |
| `test_state.py` | `get/set/remove_state` per session; no cross-session bleed |
| `test_session.py` | Old task cancelled on re-register; `cleanup_done` removes finished tasks |
| `test_pipeline.py` | Pipeline with mocked STT/LLM/TTS yields all expected event types in order |

### Frontend (run from `voice/frontend/`)

```bash
npm install
npm run build   # must compile with zero TypeScript errors
```

- Zero `tsc` errors
- No usage of `ScriptProcessor` anywhere in source
- `useJarvisVoice` hook exports all 8 documented fields

### Integration

```bash
# Start backend (Ollama must be running with at least one model)
uvicorn main:app --port 8000

# Connect frontend at localhost:5174
# 1. Click "Activate Voice"
# 2. Say "search for the latest AI news"
# 3. Expect: transcript shows your words, agent shows "Hector (Research)", reply streams in
# 4. Say something while Alphonso is speaking → barge-in triggers, speaking stops
```

---

## What Is Explicitly OUT OF SCOPE for This Handoff

Do NOT do any of the following — these are reviewer tasks:

- Wiring the Voice OS into the main Alphonso Tauri app (`src/`)
- Adding a Tauri sidecar launcher for the Python backend
- Connecting pipeline events to `appendAgentActivity` in the main app
- Modifying `src/services/voiceService.js` or `src/hooks/useVoiceInput.js`
- Changing anything in `src-tauri/`
- Modifying `src/components/`
- Running `npm run test` against the main app test suite

Work only in `voice/`. Do not touch anything outside it.

---

## Handing Back

When all 12 tasks are done and the acceptance checklist above passes:

1. Commit everything to the `feat/voice-os` branch with message: `feat(voice): implement full voice OS pipeline (STT+LLM+TTS+VAD+barge-in)`
2. Push the branch
3. Leave a summary comment listing which tasks were completed, any deviations from this spec, and any known remaining issues

The reviewer (Claude Code) will then run `npm run test` on the main repo, verify the voice pipeline end-to-end, integrate it into the Tauri app, and merge to `main`.

---

*Handoff prepared by Claude Code — 2026-06-24*