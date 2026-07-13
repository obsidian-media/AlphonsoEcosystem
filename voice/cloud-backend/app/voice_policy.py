from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


class VoicePolicyError(ValueError):
    """Raised when voice context cannot be mapped to a supported profile."""

    status_code = 422
    safe_message = "Cloud voice request has unsupported agent or language context"


@dataclass(frozen=True)
class VoiceAgent:
    id: str
    display_name: str
    role_summary: str
    key_constraint: str
    capabilities: str
    voice_persona: str


LANGUAGE_LABELS = {
    "en-US": "English (en-US)",
    "es-US": "Spanish (es-US)",
    "fr-FR": "French (fr-FR)",
    "de-DE": "German (de-DE)",
    "ja-JP": "Japanese (ja-JP)",
    "zh-CN": "Chinese (zh-CN)",
    "fa-IR": "Persian (fa-IR)",
}


@lru_cache(maxsize=1)
def _policy() -> dict[str, object]:
    policy_path = Path(__file__).resolve().parents[2] / "shared" / "voice_policy.json"
    return json.loads(policy_path.read_text(encoding="utf-8"))


def get_voice_agent(agent_id: str) -> VoiceAgent | None:
    for raw_agent in _policy()["agents"]:
        if raw_agent["id"] == agent_id:
            return VoiceAgent(
                id=raw_agent["id"],
                display_name=raw_agent["displayName"],
                role_summary=raw_agent["roleSummary"],
                key_constraint=raw_agent["keyConstraint"],
                capabilities=raw_agent["capabilities"],
                voice_persona=raw_agent["voicePersona"],
            )
    return None


def build_system_message(agent_id: str, language: str) -> str:
    agent = get_voice_agent(agent_id)
    if agent is None:
        raise VoicePolicyError("Unknown voice agent")
    language_label = LANGUAGE_LABELS.get(language)
    if language_label is None:
        raise VoicePolicyError("Unsupported voice language")
    return "\n".join(
        [
            f"You are {agent.display_name}.",
            f"Role: {agent.role_summary}",
            f"Key constraint: {agent.key_constraint}",
            f"Capabilities: {agent.capabilities}",
            f"Voice persona: {agent.voice_persona}",
            f"Reply language: {language_label}.",
            *[str(rule) for rule in _policy()["rules"]],
        ]
    )
