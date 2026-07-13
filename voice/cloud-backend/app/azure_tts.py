from __future__ import annotations

from xml.sax.saxutils import escape

import httpx

from app.config import Settings
from app.nvidia import NvidiaError, NvidiaOutputError


class AzureTTSClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def synthesize(self, text: str) -> bytes:
        if not self.settings.azure_speech_key or not self.settings.azure_speech_region:
            raise NvidiaError()
        ssml = (
            '<speak version="1.0" xml:lang="fa-IR">'
            f'<voice xml:lang="fa-IR" name="{escape(self.settings.azure_tts_farsi_voice)}">'
            f"{escape(text)}</voice></speak>"
        )
        headers = {
            "Ocp-Apim-Subscription-Key": self.settings.azure_speech_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
            "User-Agent": "alphonso-cloud-voice",
        }
        url = f"https://{self.settings.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/v1"
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(url, headers=headers, content=ssml.encode("utf-8"))
                if response.is_error:
                    raise NvidiaError()
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            raise NvidiaError() from error
        if not response.content or not response.content.startswith(b"RIFF"):
            raise NvidiaOutputError()
        return response.content
