from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    voice_cloud_api_key: str
    nvidia_api_key: str
    nim_base_url: str
    nim_model: str
    magpie_url: str
    magpie_voice: str
    chatterbox_url: str
    chatterbox_voice: str
    piper_farsi_url: str
    piper_service_token: str
    piper_farsi_default_voice: str
    request_timeout_seconds: float
    supabase_url: str
    supabase_service_role_key: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            voice_cloud_api_key=os.environ.get("VOICE_CLOUD_API_KEY", "").strip(),
            nvidia_api_key=os.environ.get("NVIDIA_API_KEY", "").strip(),
            nim_base_url=os.environ.get("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/"),
            nim_model=os.environ.get("NVIDIA_NIM_MODEL", "").strip(),
            magpie_url=os.environ.get("NVIDIA_TTS_MAGPIE_URL", "").strip(),
            magpie_voice=os.environ.get("NVIDIA_TTS_MAGPIE_DEFAULT_VOICE", "").strip(),
            chatterbox_url=os.environ.get("NVIDIA_TTS_CHATTERBOX_URL", "").strip(),
            chatterbox_voice=os.environ.get("NVIDIA_TTS_CHATTERBOX_DEFAULT_VOICE", "").strip(),
            piper_farsi_url=os.environ.get("PIPER_FARSI_URL", "").rstrip("/"),
            piper_service_token=os.environ.get("PIPER_SERVICE_TOKEN", "").strip(),
            piper_farsi_default_voice=os.environ.get("PIPER_FARSI_DEFAULT_VOICE", "mana").strip(),
            request_timeout_seconds=float(os.environ.get("VOICE_CLOUD_TIMEOUT_SECONDS", "60")),
            supabase_url=os.environ.get("SUPABASE_URL", "").rstrip("/"),
            supabase_service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        )

    @property
    def is_ready(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key and self.nvidia_api_key and self.nim_model and self.magpie_url)

    def public_status(self) -> dict[str, object]:
        return {
            "ready": self.is_ready,
            "nvidia_nim": bool(self.nvidia_api_key and self.nim_model),
            "device_enrollment": bool(self.supabase_url and self.supabase_service_role_key),
            "tts": {
                "magpie": bool(self.magpie_url),
                "chatterbox": bool(self.chatterbox_url),
                "piper_farsi": bool(self.piper_farsi_url and self.piper_service_token),
            },
        }
