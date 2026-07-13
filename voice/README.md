# Alphonso Voice OS

Real-time interruptible voice agent system with both local and cloud delivery paths. **Status: Production-ready — merged to main 2026-06-24.**

## Pipeline

```
Microphone (AudioWorklet, 16kHz PCM)
  → WebSocket binary frames → FastAPI (port 8765)
  → webrtcvad gate (discards silence)
  → faster-whisper STT (tiny.en, CPU int8, lru_cache)
  → 9-agent regex router
  → Ollama /api/chat streaming (conversation history, max 10 turns)
  → piper TTS (ThreadPoolExecutor, async)
  → WebSocket binary frame → AudioContext playback
          ↑ barge-in cancels current task at any state ↑
```

### Cloud Voice Path

```
iOS push-to-talk
  → Railway FastAPI POST /voice/respond
  → Ollama reply generation
  → NVIDIA TTS model: magpie or chatterbox
  → base64 WAV audio response
  → AVAudioPlayer playback on mobile
```

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) running locally on port 11434 with at least one model pulled

## Quick Start

### Run the backend

```bash
cd voice/backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

Check health: `curl http://127.0.0.1:8765/health` → `{"status": "ok"}`

### Or launch from Alphonso Runtime Manager

Open Alphonso → **Runtime Manager** → **Voice OS** → **Start**

### Run the standalone frontend (optional — for standalone testing)

```bash
cd voice/frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODEL` | `llama3` | Ollama model name (overrides default `llama3`) |
| `VOICE_CLOUD_API_KEY` | unset | Optional bearer token required by `POST /voice/respond` |
| `NVIDIA_API_KEY` | unset | NVIDIA API key used for hosted TTS calls |
| `NVIDIA_TTS_MAGPIE_URL` | unset | Hosted endpoint for `magpie-tts-multilingual` |
| `NVIDIA_TTS_CHATTERBOX_URL` | unset | Hosted endpoint for `resembleai/chatterbox-multilingual-tts` |
| `NVIDIA_TTS_MAGPIE_VOICE` | unset | Optional voice override for Magpie |
| `NVIDIA_TTS_CHATTERBOX_VOICE` | unset | Optional voice override for Chatterbox |
| `NVIDIA_TTS_LANGUAGE` | unset | Optional default language override for cloud synthesis |

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
pipeline.py     Core async generator: VAD → STT → LLM → TTS/cloud voice
vad.py          WebRTC VAD (30ms frame analysis, 30% threshold)
stt.py          faster-whisper, base model, cpu+int8, lru_cache
tts.py          piper-tts + NVIDIA hosted TTS adapter
router.py       Regex-based intent → agent mapping
session.py      Per-session asyncio.Task registry
state.py        Per-session VoiceState dict
```

---

## Tests

Five pytest test files live in `voice/backend/tests/`:

| File | Coverage |
|------|----------|
| `test_state.py` | Per-session get/set/remove, no cross-session bleed |
| `test_session.py` | Old task cancellation on re-register, `cleanup_done` sweep |
| `test_router.py` | All 9 agents, keyword patterns, default fallback |
| `test_stt.py` | Returns `str`, no subprocess calls, empty audio → empty string |
| `test_pipeline.py` | Yields all expected event types, silent audio, conversation_history accepted |

Run from `voice/backend/`:

```bash
python -m pytest tests/ -v
```

## Tauri Integration

The voice server is launched and stopped from the main Alphonso app via:

- **Rust**: `src-tauri/src/voice_sidecar.rs` — `voice_start`, `voice_stop`, `voice_status` commands
- **JS service**: `src/services/voiceOsService.js` — wraps `invoke()` calls
- **Hook**: `src/hooks/useJarvisVoice.ts` — drop-in replacement for browser SpeechRecognition
- **UI**: Runtime Manager → Voice OS card (start/stop buttons, status indicator)

---

*Last updated: 2026-06-24 — v2.2.0*
