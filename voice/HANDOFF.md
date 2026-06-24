# Alphonso Voice OS — Agent Handoff Brief

**Branch:** `feat/voice-os`
**Assigned to:** OpenCode (or equivalent autonomous coding agent)
**Maturity target:** 10 → 90 / 100
**Reviewer after handoff:** Claude Code (will verify, integrate, and merge to `main`)

---

## What This Is

A standalone real-time voice pipeline that gives Alphonso a **Jarvis-style full-duplex voice interface**:

```
Microphone → [VAD] → [STT: Whisper] → [LLM: Ollama] → [TTS: Piper] → Speaker
                                  ↑ barge-in supported ↑
```

The scaffold (10/100) lives in `voice/`. Your job is to implement every stub, fix every architectural flaw, and deliver a fully working system. This doc tells you exactly what to do at every layer.

---

## Repo Context (READ THIS FIRST)

- **Main stack:** React + TypeScript frontend, Tauri (Rust) desktop shell, Vitest test suite (1930+ tests)
- **LLM runtime:** Ollama (local), accessed at `http://localhost:11434` — already used by the main app
- **Existing voice in main app:** `src/services/voiceService.js` + `src/hooks/useVoiceInput.js` — browser SpeechRecognition only, online-only, no TTS. This Voice OS replaces/extends that with offline capability.
- **Do NOT touch `src/`** (the main Tauri app) — this is a standalone microservice for now. Integration happens later by the reviewer.
- **Python runtime:** The main app already detects Python via `src-tauri/src/runtime_manager.rs`. Assume Python 3.11+ available.
- **All tests must continue to pass:** `npm run test` in the repo root must still show 1930+ passing after your changes (your changes are in `voice/` only, so this should be automatic — just don't touch anything outside `voice/`).

---

## Directory Layout You Are Working In

```
voice/
  backend/
    main.py          ← FastAPI WebSocket server (stub — rewrite)
    pipeline.py      ← STT→LLM→TTS orchestration (stub — rewrite)
    stt.py           ← Whisper transcription (stub — rewrite)
    tts.py           ← Piper TTS synthesis (stub — rewrite)
    vad.py           ← Voice activity detection (stub — rewrite)
    router.py        ← Agent routing (stub — extend)
    session.py       ← Session/task registry (bug — fix)
    state.py         ← State enum (global var bug — fix)
    requirements.txt ← Incomplete — replace entirely
  frontend/
    src/
      App.tsx            ← Minimal UI (extend)
      useJarvisVoice.ts  ← WebSocket hook (deprecated API — rewrite)
  configs/
    agents.yml       ← Agent config (extend)
  docker-compose.yml ← Extend with proper volumes/env
  README.md          ← You will replace this with your own
```

---

## The 12 Implementation Tasks

Work through these in order. Each task has a clear acceptance criterion.

---

### TASK 1 — Fix `requirements.txt` (backend)

Replace the current 4-line stub with the complete dependency list.

**File:** `voice/backend/requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
websockets==13.0
numpy==1.26.4
faster-whisper==1.0.3
piper-tts==1.2.0
webrtcvad==2.0.10
httpx==0.27.2
pydantic==2.8.2
python-multipart==0.0.9
aiofiles==24.1.0
```

**Notes:**
- `faster-whisper` is the Python-native Whisper binding (no subprocess, no external binary)
- `piper-tts` is the Python-native Piper binding (no subprocess)
- `webrtcvad` is Google's WebRTC VAD ported to Python — fast, accurate, no ML model needed
- Do NOT add torch/transformers unless faster-whisper pulls them in (it uses ctranslate2 instead)

**Acceptance:** `pip install -r requirements.txt` completes without error on a clean venv.

---

### TASK 2 — Fix `state.py` (global state → session-scoped)

The current `state.py` has a module-level global `current_state`. Under concurrent sessions this will cause race conditions. Replace with a session-keyed dict.

**File:** `voice/backend/state.py`

```python
from enum import Enum
from typing import Dict

class VoiceState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"

_states: Dict[str, VoiceState] = {}

def get_state(session_id: str) -> VoiceState:
    return _states.get(session_id, VoiceState.IDLE)

def set_state(session_id: str, state: VoiceState) -> None:
    _states[session_id] = state

def remove_state(session_id: str) -> None:
    _states.pop(session_id, None)
```

**Acceptance:** No module-level mutable globals. State is keyed by session_id.

---

### TASK 3 — Fix `session.py` (task registry + cleanup)

The current session registry cancels old tasks but never cleans up finished ones — it's a memory leak. Fix it.

**File:** `voice/backend/session.py`

```python
import asyncio
from typing import Dict, Optional

_sessions: Dict[str, asyncio.Task] = {}

def register(session_id: str, task: asyncio.Task) -> None:
    old = _sessions.get(session_id)
    if old and not old.done():
        old.cancel()
    _sessions[session_id] = task

def cancel(session_id: str) -> None:
    task = _sessions.pop(session_id, None)
    if task and not task.done():
        task.cancel()

def cleanup_done() -> None:
    finished = [sid for sid, t in _sessions.items() if t.done()]
    for sid in finished:
        del _sessions[sid]
```

**Acceptance:** No unbounded growth of `_sessions`. Call `cleanup_done()` periodically (in `main.py` background task).

---

### TASK 4 — Rewrite `vad.py` (real VAD with webrtcvad)

Replace the energy heuristic with Google WebRTC VAD.

**File:** `voice/backend/vad.py`

```python
import webrtcvad
from typing import List

_vad = webrtcvad.Vad(mode=2)  # mode 0=least aggressive, 3=most aggressive

SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30  # webrtcvad supports 10, 20, or 30ms frames
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2  # bytes (16-bit PCM)

def is_speech(pcm_bytes: bytes) -> bool:
    """
    Returns True if the PCM chunk contains speech.
    pcm_bytes must be 16-bit mono PCM at 16kHz.
    Splits into 30ms frames and returns True if >30% of frames contain speech.
    """
    if len(pcm_bytes) < FRAME_SIZE:
        return False

    frames = _split_frames(pcm_bytes)
    if not frames:
        return False

    speech_frames = sum(1 for f in frames if _vad.is_speech(f, SAMPLE_RATE))
    return (speech_frames / len(frames)) > 0.30

def _split_frames(pcm_bytes: bytes) -> List[bytes]:
    frames = []
    offset = 0
    while offset + FRAME_SIZE <= len(pcm_bytes):
        frames.append(pcm_bytes[offset:offset + FRAME_SIZE])
        offset += FRAME_SIZE
    return frames

def voice_activity_level(pcm_bytes: bytes) -> float:
    """Legacy float interface — kept for compatibility. Returns 1.0 or 0.0."""
    return 1.0 if is_speech(pcm_bytes) else 0.0
```

**Acceptance:** `is_speech(silent_pcm)` returns False. `is_speech(voice_pcm)` returns True. Unit-testable without audio hardware.

---

### TASK 5 — Rewrite `stt.py` (faster-whisper, no subprocess)

Replace the whisper.cpp subprocess hack with faster-whisper Python API.

**File:** `voice/backend/stt.py`

```python
import io
import wave
import numpy as np
from faster_whisper import WhisperModel
from functools import lru_cache

SAMPLE_RATE = 16000
MODEL_SIZE = "base"  # options: tiny, base, small, medium, large-v3

@lru_cache(maxsize=1)
def _get_model() -> WhisperModel:
    # cpu + int8 quantization — runs on any machine, no GPU required
    # On GPU machines, change device="cuda", compute_type="float16"
    return WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")

def transcribe(pcm: bytes, language: str = "en") -> str:
    """
    Transcribe raw 16-bit mono PCM at 16kHz.
    Returns the transcribed text or empty string if silent/unintelligible.
    """
    if not pcm:
        return ""

    # Convert PCM bytes → float32 numpy array (faster-whisper expects float32)
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0

    model = _get_model()
    segments, info = model.transcribe(
        audio,
        language=language,
        beam_size=3,
        vad_filter=True,         # built-in Silero VAD in faster-whisper
        vad_parameters=dict(
            min_silence_duration_ms=300,
            speech_pad_ms=100,
        ),
    )

    text = " ".join(seg.text.strip() for seg in segments).strip()
    return text

def preload_model() -> None:
    """Call at startup to avoid cold-start on first request."""
    _get_model()
```

**Key decisions:**
- `base` model: ~145MB, ~2–4x realtime on CPU. User can override via env var `WHISPER_MODEL`.
- `lru_cache(maxsize=1)` ensures the model loads once and stays in memory.
- `vad_filter=True` uses faster-whisper's built-in Silero VAD — double-layer VAD with webrtcvad at the gate + Silero inside Whisper.
- No temp files, no subprocesses.

**Acceptance:** `transcribe(b"")` returns `""`. `transcribe(valid_pcm)` returns a non-empty string. Model loads in < 3s on CPU.

---

### TASK 6 — Rewrite `tts.py` (piper-tts Python package, no subprocess)

Replace the piper subprocess hack with the piper-tts Python API plus an async wrapper so it doesn't block the event loop.

**File:** `voice/backend/tts.py`

```python
import asyncio
import io
import wave
import struct
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

# piper-tts Python binding
from piper import PiperVoice

_executor = ThreadPoolExecutor(max_workers=2)

VOICE_MODEL_PATH = "voices/en_US-lessac-medium.onnx"  # download instructions below
VOICE_CONFIG_PATH = "voices/en_US-lessac-medium.onnx.json"

@lru_cache(maxsize=1)
def _get_voice() -> PiperVoice:
    return PiperVoice.load(VOICE_MODEL_PATH, config_path=VOICE_CONFIG_PATH, use_cuda=False)

def _synthesize_sync(text: str) -> bytes:
    """Runs in thread pool — piper is CPU-bound and not async."""
    voice = _get_voice()
    buf = io.BytesIO()

    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)

        for audio_bytes in voice.synthesize_stream_raw(text):
            wf.writeframes(audio_bytes)

    return buf.getvalue()

async def synthesize(text: str) -> bytes:
    """Async entrypoint — offloads CPU work to thread pool."""
    if not text.strip():
        return b""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _synthesize_sync, text)

def preload_voice() -> None:
    """Call at startup to avoid cold-start."""
    _get_voice()
```

**Voice model download (add to README and docker-compose):**
```bash
mkdir -p voice/backend/voices
# Download lessac-medium English voice (~65MB)
curl -L -o voice/backend/voices/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o voice/backend/voices/en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

**Acceptance:** `asyncio.run(synthesize("Hello"))` returns non-empty WAV bytes. No subprocess spawned.

---

### TASK 7 — Rewrite `router.py` (Ollama-powered agent detection)

The stub always returns `"alphonso_core"`. Extend it to map voice intents to Alphonso's 9 agents via keyword detection. This does NOT call the agents yet — just classifies intent so the LLM context can be set correctly.

**File:** `voice/backend/router.py`

```python
import re
from typing import Literal

AgentName = Literal[
    "alphonso_core",  # default — general assistant
    "jose",           # task orchestration
    "hector",         # research / web search
    "miya",           # content creation
    "maria",          # governance / compliance audit
    "marcus",         # distribution / publishing
    "echo",           # memory
    "sentinel",       # security scan
    "nova",           # opportunity analysis
]

_PATTERNS: list[tuple[re.Pattern, AgentName]] = [
    (re.compile(r"\b(search|find|research|look up|what is|who is)\b", re.I), "hector"),
    (re.compile(r"\b(write|draft|create|compose|generate content)\b", re.I), "miya"),
    (re.compile(r"\b(publish|post|share|distribute|send to)\b", re.I), "marcus"),
    (re.compile(r"\b(remember|recall|memory|what did i|last time)\b", re.I), "echo"),
    (re.compile(r"\b(task|assign|do this|schedule|plan|todo)\b", re.I), "jose"),
    (re.compile(r"\b(security|scan|vulnerability|audit|risk)\b", re.I), "sentinel"),
    (re.compile(r"\b(opportunity|market|trend|analyse|analysis|growth)\b", re.I), "nova"),
    (re.compile(r"\b(policy|compliance|governance|approve|review)\b", re.I), "maria"),
]

def detect_agent(text: str) -> AgentName:
    for pattern, agent in _PATTERNS:
        if pattern.search(text):
            return agent
    return "alphonso_core"
```

**Acceptance:** `detect_agent("search the web for news")` returns `"hector"`. `detect_agent("hello")` returns `"alphonso_core"`.

---

### TASK 8 — Rewrite `pipeline.py` (real async pipeline with Ollama)

This is the core orchestration. Replace the stub with a real async generator that calls Ollama.

**File:** `voice/backend/pipeline.py`

```python
import asyncio
import httpx
from typing import AsyncGenerator, Any
from vad import is_speech
from stt import transcribe
from tts import synthesize
from router import detect_agent, AgentName

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "llama3"  # overridable via env OLLAMA_MODEL

_AGENT_SYSTEM_PROMPTS: dict[str, str] = {
    "alphonso_core": "You are Alphonso, a helpful AI assistant. You are responding via voice, so keep replies concise — 1-3 sentences max. No markdown, no lists, no bullet points.",
    "jose": "You are Jose, Alphonso's task orchestration agent. Help the user plan and assign tasks. Voice mode: keep it to 1-3 sentences.",
    "hector": "You are Hector, Alphonso's research agent. Give accurate, concise answers. Voice mode: 1-3 sentences, no URLs.",
    "miya": "You are Miya, Alphonso's content creation agent. Help write and create. Voice mode: 1-3 sentences.",
    "maria": "You are Maria, Alphonso's governance agent. Assess compliance and risk concisely. Voice mode: 1-3 sentences.",
    "marcus": "You are Marcus, Alphonso's distribution agent. Help publish and share. Voice mode: 1-3 sentences.",
    "echo": "You are Echo, Alphonso's memory agent. Recall and summarize information. Voice mode: 1-3 sentences.",
    "sentinel": "You are Sentinel, Alphonso's security agent. Report threats clearly and concisely. Voice mode: 1-3 sentences.",
    "nova": "You are Nova, Alphonso's opportunity analysis agent. Identify and explain opportunities. Voice mode: 1-3 sentences.",
}

import os
_MODEL = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)


async def _call_ollama(
    session_id: str,
    text: str,
    agent: AgentName,
    conversation_history: list[dict],
) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama /api/chat endpoint."""
    system_prompt = _AGENT_SYSTEM_PROMPTS.get(agent, _AGENT_SYSTEM_PROMPTS["alphonso_core"])

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])  # last 5 exchanges = 10 messages
    messages.append({"role": "user", "content": text})

    payload = {
        "model": _MODEL,
        "messages": messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            import json
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if chunk.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


async def run_pipeline(
    session_id: str,
    pcm: bytes,
    conversation_history: list[dict],
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Main voice pipeline generator. Yields event dicts consumed by main.py.

    Event types:
      {"type": "stt", "text": str}                  — transcription result
      {"type": "agent", "name": str}                 — detected agent
      {"type": "llm", "text": str, "done": bool}     — LLM token stream
      {"type": "state", "value": str}                — state transition
      {"type": "tts", "audio": bytes}                — synthesized audio
      {"type": "error", "message": str}              — pipeline error
    """

    # Step 1: VAD gate — discard silent audio
    if not is_speech(pcm):
        return

    # Step 2: STT
    yield {"type": "state", "value": "listening"}
    try:
        text = await asyncio.get_event_loop().run_in_executor(None, transcribe, pcm)
    except Exception as e:
        yield {"type": "error", "message": f"STT failed: {e}"}
        return

    if not text:
        yield {"type": "state", "value": "idle"}
        return

    yield {"type": "stt", "text": text}

    # Step 3: Agent routing
    agent = detect_agent(text)
    yield {"type": "agent", "name": agent}

    # Step 4: LLM — stream tokens
    yield {"type": "state", "value": "thinking"}
    full_reply = ""
    try:
        async for token in _call_ollama(session_id, text, agent, conversation_history):
            full_reply += token
            yield {"type": "llm", "text": token, "done": False}
    except Exception as e:
        yield {"type": "error", "message": f"LLM failed: {e}"}
        yield {"type": "state", "value": "idle"}
        return

    yield {"type": "llm", "text": "", "done": True}

    if not full_reply.strip():
        yield {"type": "state", "value": "idle"}
        return

    # Step 5: TTS
    yield {"type": "state", "value": "speaking"}
    try:
        audio = await synthesize(full_reply)
        yield {"type": "tts", "audio": audio}
    except Exception as e:
        yield {"type": "error", "message": f"TTS failed: {e}"}

    yield {"type": "state", "value": "idle"}
```

**Acceptance:** `run_pipeline` is an async generator yielding correctly typed events. Ollama call is streaming. VAD gate prevents empty transcription calls.

---

### TASK 9 — Rewrite `main.py` (production-grade WebSocket server)

The current main.py has a global state bug, no cleanup, no error handling, no startup preloading. Rewrite it.

**File:** `voice/backend/main.py`

```python
import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pipeline import run_pipeline
from session import register, cancel, cleanup_done
from state import get_state, set_state, remove_state, VoiceState
from stt import preload_model
from tts import preload_voice

BUFFER_THRESHOLD_BYTES = int(os.environ.get("BUFFER_THRESHOLD_BYTES", 32000))  # ~1s at 16kHz 16-bit


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload models at startup so first request is fast
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, preload_model)
    await loop.run_in_executor(None, preload_voice)

    # Background session cleanup task
    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    cleanup_task.cancel()


async def _cleanup_loop():
    while True:
        await asyncio.sleep(60)
        cleanup_done()


app = FastAPI(title="Alphonso Voice OS", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def voice_websocket(ws: WebSocket):
    await ws.accept()

    session_id = ws.headers.get("x-session", "anon")
    buffer = bytearray()
    conversation_history: list[dict] = []

    try:
        while True:
            msg = await ws.receive()

            # Barge-in: if speaking and new audio arrives, cancel current pipeline
            if get_state(session_id) == VoiceState.SPEAKING and "bytes" in msg:
                cancel(session_id)
                set_state(session_id, VoiceState.IDLE)
                buffer = bytearray()
                await ws.send_json({"type": "state", "value": "idle", "barge_in": True})
                continue

            if "bytes" in msg:
                buffer.extend(msg["bytes"])

                if len(buffer) >= BUFFER_THRESHOLD_BYTES:
                    pcm_chunk = bytes(buffer)
                    buffer = bytearray()

                    task = asyncio.create_task(
                        _process_chunk(ws, session_id, pcm_chunk, conversation_history)
                    )
                    register(session_id, task)

            elif "text" in msg:
                # Control messages from frontend (e.g. {"type": "reset"})
                try:
                    ctrl = json.loads(msg["text"])
                    if ctrl.get("type") == "reset":
                        cancel(session_id)
                        conversation_history.clear()
                        buffer = bytearray()
                        set_state(session_id, VoiceState.IDLE)
                        await ws.send_json({"type": "state", "value": "idle"})
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        cancel(session_id)
        remove_state(session_id)


async def _process_chunk(
    ws: WebSocket,
    session_id: str,
    pcm: bytes,
    conversation_history: list[dict],
) -> None:
    """Process one PCM chunk through the full pipeline."""
    user_text = ""
    reply_text = ""

    try:
        async for event in run_pipeline(session_id, pcm, conversation_history):
            event_type = event.get("type")
            set_state(session_id, VoiceState(event.get("value", get_state(session_id))))

            if event_type == "tts":
                await ws.send_bytes(event["audio"])
            elif event_type == "error":
                await ws.send_json(event)
            else:
                await ws.send_json(event)

            # Track conversation for multi-turn
            if event_type == "stt":
                user_text = event["text"]
            elif event_type == "llm" and event.get("done"):
                reply_text = reply_text  # accumulated below
            elif event_type == "llm" and not event.get("done"):
                reply_text += event["text"]

    except asyncio.CancelledError:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Append to conversation history for multi-turn
        if user_text:
            conversation_history.append({"role": "user", "content": user_text})
        if reply_text:
            conversation_history.append({"role": "assistant", "content": reply_text})
        # Cap history at 20 messages (10 exchanges)
        if len(conversation_history) > 20:
            conversation_history[:] = conversation_history[-20:]
```

**Acceptance:** Server starts with `uvicorn main:app --host 0.0.0.0 --port 8000`. `/health` returns 200. WebSocket connects. Barge-in cancels previous task. Conversation history accumulates across turns.

---

### TASK 10 — Rewrite `useJarvisVoice.ts` (AudioWorklet, no deprecated ScriptProcessor)

`ScriptProcessor` is deprecated in all modern browsers. Replace with `AudioWorklet`.

**Create two files:**

**File 1: `voice/frontend/src/pcm-processor.worklet.ts`** (compiled separately as a worklet)

```typescript
// AudioWorklet processor — runs in audio thread
// NOTE: This file must NOT import anything — worklet scope is isolated
class PcmProcessor extends AudioWorkletNode {
  // This is a placeholder — the actual worklet runs as a string blob
}

// The worklet code as a string (injected at registration time)
export const PCM_WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const pcm = new Int16Array(input[0].length);
      for (let i = 0; i < input[0].length; i++) {
        pcm[i] = Math.max(-32768, Math.min(32767, input[0][i] * 32767));
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
`;
```

**File 2: `voice/frontend/src/useJarvisVoice.ts`** (full rewrite)

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import { PCM_WORKLET_CODE } from './pcm-processor.worklet';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceEvent {
  type: 'stt' | 'llm' | 'state' | 'agent' | 'error';
  text?: string;
  value?: VoiceState;
  name?: string;
  done?: boolean;
  barge_in?: boolean;
  message?: string;
}

export interface UseJarvisVoiceReturn {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  state: VoiceState;
  transcript: string;
  reply: string;
  activeAgent: string;
  error: string | null;
  isConnected: boolean;
}

const WS_URL = import.meta.env.VITE_VOICE_WS_URL ?? 'ws://localhost:8000/ws';

export function useJarvisVoice(): UseJarvisVoiceReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [activeAgent, setActiveAgent] = useState('alphonso_core');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const stop = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setState('idle');
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'reset' }));
    setTranscript('');
    setReply('');
    setActiveAgent('alphonso_core');
    setError(null);
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);

      // WebSocket
      const sessionId = `session-${Date.now()}`;
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => setError('WebSocket connection failed');

      ws.onmessage = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          // TTS audio — play it
          _playAudio(e.data, audioCtxRef.current);
          return;
        }
        try {
          const event: VoiceEvent = JSON.parse(e.data as string);
          if (event.type === 'state' && event.value) {
            setState(event.value);
          } else if (event.type === 'stt' && event.text) {
            setTranscript(event.text);
            setReply(''); // clear previous reply
          } else if (event.type === 'llm' && event.text) {
            setReply(prev => prev + event.text);
          } else if (event.type === 'agent' && event.name) {
            setActiveAgent(event.name);
          } else if (event.type === 'error' && event.message) {
            setError(event.message);
            setState('error');
          }
        } catch {
          // ignore parse errors
        }
      };

      await new Promise<void>((res, rej) => {
        ws.addEventListener('open', () => res());
        ws.addEventListener('error', () => rej(new Error('Connection failed')));
        setTimeout(() => rej(new Error('Connection timeout')), 5000);
      });

      // Microphone + AudioContext
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      // Register worklet via blob URL
      const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const src = ctx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      src.connect(workletNode);
      // Do NOT connect workletNode to ctx.destination (avoids audio feedback loop)

      setState('listening');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
      stop();
    }
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { start, stop, reset, state, transcript, reply, activeAgent, error, isConnected };
}

function _playAudio(audioData: ArrayBuffer, ctx: AudioContext | null): void {
  if (!ctx) return;
  ctx.decodeAudioData(audioData.slice(0), decoded => {
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.start();
  }).catch(() => {});
}
```

**Acceptance:** No ScriptProcessor anywhere. AudioWorklet registers via blob URL. TTS audio plays back through the same AudioContext. `stop()` tears down cleanly with no lingering tracks.

---

### TASK 11 — Rewrite `App.tsx` (complete voice UI)

The stub shows 3 lines of text. Build a proper voice interface.

**File:** `voice/frontend/src/App.tsx`

```tsx
import { useJarvisVoice } from './useJarvisVoice';

const STATE_COLORS: Record<string, string> = {
  idle: '#6b7280',
  listening: '#3b82f6',
  thinking: '#f59e0b',
  speaking: '#10b981',
  error: '#ef4444',
};

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Error',
};

const AGENT_LABELS: Record<string, string> = {
  alphonso_core: 'Alphonso',
  jose: 'Jose (Tasks)',
  hector: 'Hector (Research)',
  miya: 'Miya (Content)',
  maria: 'Maria (Governance)',
  marcus: 'Marcus (Distribution)',
  echo: 'Echo (Memory)',
  sentinel: 'Sentinel (Security)',
  nova: 'Nova (Opportunities)',
};

export default function App() {
  const { start, stop, reset, state, transcript, reply, activeAgent, error, isConnected } =
    useJarvisVoice();

  const isActive = state !== 'idle' && state !== 'error';
  const dotColor = STATE_COLORS[state] ?? '#6b7280';

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Alphonso Voice OS</h1>

      {/* State indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor, boxShadow: isActive ? `0 0 12px ${dotColor}` : 'none', transition: 'all 0.3s' }} />
        <span style={{ fontSize: 16, color: dotColor }}>{STATE_LABELS[state] ?? state}</span>
      </div>

      {/* Active agent */}
      {isConnected && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          Agent: <strong style={{ color: '#38bdf8' }}>{AGENT_LABELS[activeAgent] ?? activeAgent}</strong>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12 }}>
        {!isConnected ? (
          <button onClick={start} style={btnStyle('#3b82f6')}>
            Activate Voice
          </button>
        ) : (
          <>
            <button onClick={stop} style={btnStyle('#ef4444')}>
              Stop
            </button>
            <button onClick={reset} style={btnStyle('#6b7280')}>
              Reset Conversation
            </button>
          </>
        )}
      </div>

      {/* Transcript */}
      {transcript && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>You said</div>
          <div style={{ fontSize: 15 }}>{transcript}</div>
        </div>
      )}

      {/* LLM Reply */}
      {reply && (
        <div style={{ ...cardStyle, borderColor: '#1e3a5f' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            {AGENT_LABELS[activeAgent] ?? 'Alphonso'} replied
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{reply}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ ...cardStyle, borderColor: '#7f1d1d', background: '#1c0a0a' }}>
          <div style={{ fontSize: 13, color: '#fca5a5' }}>{error}</div>
        </div>
      )}

      {/* Connection status */}
      <div style={{ fontSize: 12, color: '#475569' }}>
        {isConnected ? '● Connected to voice backend' : '○ Not connected'}
      </div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return { padding: '10px 24px', background: bg, color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 };
}

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 560, background: '#1e293b', borderRadius: 12,
  padding: '14px 18px', border: '1px solid #334155',
};
```

**Acceptance:** All 5 states render with the correct colour. Transcript and reply update live. Stop/reset work. Error card appears on failure.

---

### TASK 12 — Update `docker-compose.yml`, `configs/agents.yml`, and write `voice/README.md`

**File: `voice/docker-compose.yml`**

```yaml
version: '3.9'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3}
      - WHISPER_MODEL=${WHISPER_MODEL:-base}
      - BUFFER_THRESHOLD_BYTES=${BUFFER_THRESHOLD_BYTES:-32000}
    volumes:
      - ./backend/voices:/app/voices:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"  # lets container reach host Ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  frontend:
    build: ./frontend
    ports:
      - "5174:5173"  # use 5174 to avoid conflict with main Alphonso app on 5173
    environment:
      - VITE_VOICE_WS_URL=ws://localhost:8000/ws
    depends_on:
      backend:
        condition: service_healthy
```

**File: `voice/configs/agents.yml`** (extend with all 9 agents)

```yaml
agents:
  alphonso_core:
    enabled: true
    description: "General-purpose Alphonso assistant"
    ollama_model: "llama3"
  jose:
    enabled: true
    description: "Task orchestration"
    ollama_model: "llama3"
  hector:
    enabled: true
    description: "Research and web search"
    ollama_model: "llama3"
  miya:
    enabled: true
    description: "Content creation"
    ollama_model: "llama3"
  maria:
    enabled: true
    description: "Governance and compliance"
    ollama_model: "llama3"
  marcus:
    enabled: true
    description: "Distribution and publishing"
    ollama_model: "llama3"
  echo:
    enabled: true
    description: "Memory and recall"
    ollama_model: "llama3"
  sentinel:
    enabled: true
    description: "Security scanning"
    ollama_model: "llama3"
  nova:
    enabled: true
    description: "Opportunity analysis"
    ollama_model: "llama3"

voice:
  sample_rate: 16000
  buffer_threshold_bytes: 32000
  barge_in: true
  whisper_model: "base"
  tts_voice: "en_US-lessac-medium"
```

**File: `voice/README.md`** (replace the 4-line stub)

```markdown
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
```

---

## Testing Checklist (acceptance gate before handing back)

The reviewer (Claude Code) will verify every item below. If any fails, the handoff is incomplete.

### Backend (run from `voice/backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Unit tests (write these as part of your task):
python -m pytest tests/ -v
```

Write `voice/backend/tests/` with at minimum:

| Test file | What to test |
|---|---|
| `test_vad.py` | `is_speech(b"")` → False; `is_speech(silent_bytes)` → False; `is_speech(speech_bytes)` → True |
| `test_stt.py` | `transcribe(b"")` → `""`; model loads without error; output is str |
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
