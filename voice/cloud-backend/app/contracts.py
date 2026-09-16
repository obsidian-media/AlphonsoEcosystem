from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Text


AgentId = Literal[
    "alphonso", "jose", "hector", "miya", "maria", "marcus", "echo", "sentinel", "nova",
    "tutor", "translator",
]
Language = Literal["en-US", "es-US", "fr-FR", "de-DE", "ja-JP", "zh-CN", "fa-IR"]


class VoiceRequest(BaseModel):
    session_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    agent_id: AgentId = "alphonso"
    language: Language = "en-US"
    tts_model: Literal["magpie", "chatterbox"] = "magpie"
    piper_voice: Literal["mana", "manta"] = "mana"


class AnalyzeTranscriptRequest(BaseModel):
    """Submitted once a session ends, to feed the offline weakness-detection pipeline."""

    session_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
    language: Language = "en-US"
    transcript: list[ChatMessage] = Field(default_factory=list, max_length=64)


class AnalyzeTranscriptResponse(BaseModel):
    session_id: str
    weaknesses_found: int
    weaknesses_stored: int


class DeviceEnrollmentRequest(BaseModel):
    device_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=36, max_length=36)]
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Timings(BaseModel):
    llm: int
    tts: int
    total: int


class VoiceResponse(BaseModel):
    request_id: str
    session_id: str
    agent: str
    reply: str
    audio_base64: str
    tts_model: str
    tts_provider: Literal["nvidia", "piper"]
    language: str
    state: str = "idle"
    timings_ms: Timings
