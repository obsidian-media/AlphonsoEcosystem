from __future__ import annotations

import httpx

from app.config import Settings
from app.nvidia import NvidiaError, NvidiaOutputError


class PiperTTSClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def synthesize(self, text: str, voice: str) -> bytes:
        if not self.settings.piper_farsi_url or not self.settings.piper_service_token:
            raise NvidiaError()
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.piper_farsi_url}/v1/synthesize",
                    headers={"Authorization": f"Bearer {self.settings.piper_service_token}"},
                    json={"text": text, "voice": voice},
                )
                if response.is_error:
                    raise NvidiaError()
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            raise NvidiaError() from error
        if not response.content or not response.content.startswith(b"RIFF"):
            raise NvidiaOutputError()
        return response.content
