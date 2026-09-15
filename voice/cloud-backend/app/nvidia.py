from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.contracts import ChatMessage

logger = logging.getLogger(__name__)


class NvidiaError(Exception):
    status_code = 503
    safe_message = "NVIDIA voice provider is unavailable"


class NvidiaRateLimitError(NvidiaError):
    status_code = 429
    safe_message = "NVIDIA voice provider is rate limited"


class NvidiaOutputError(NvidiaError):
    status_code = 502
    safe_message = "NVIDIA voice provider returned invalid output"


@dataclass
class NvidiaClient:
    settings: Settings

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.nvidia_api_key}"}

    async def complete(self, messages: list[dict[str, str] | ChatMessage]) -> str:
        normalized_messages = [message.model_dump() if isinstance(message, ChatMessage) else message for message in messages]
        payload = {"model": self.settings.nim_model, "messages": normalized_messages, "max_tokens": 320, "temperature": 0.4, "stream": False}
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(f"{self.settings.nim_base_url}/chat/completions", headers=self.headers, json=payload)
                self._raise_for_status(response, context="chat/completions")
                content = response.json()["choices"][0]["message"]["content"].strip()
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            logger.error("NVIDIA chat/completions %s: %s", type(error).__name__, error)
            raise NvidiaError() from error
        except (KeyError, IndexError, TypeError, ValueError) as error:
            logger.error("NVIDIA chat/completions returned unparseable output: %s: %s", type(error).__name__, error)
            raise NvidiaOutputError() from error
        if not content:
            raise NvidiaOutputError()
        return content

    async def synthesize(self, text: str, language: str, model: str) -> bytes:
        endpoint, voice = self._tts_target(model)
        form = {"text": (None, text), "language": (None, language), "voice": (None, voice)}
        if model == "magpie":
            form.update({"encoding": (None, "LINEAR_PCM"), "sample_rate_hz": (None, "44100")})
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(endpoint, headers=self.headers, files=form)
                self._raise_for_status(response, context=f"tts/{model}")
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            logger.error("NVIDIA tts/%s %s: %s", model, type(error).__name__, error)
            raise NvidiaError() from error
        if not response.content or not response.content.startswith(b"RIFF"):
            raise NvidiaOutputError()
        return response.content

    def _tts_target(self, model: str) -> tuple[str, str]:
        if model == "magpie":
            return self.settings.magpie_url, self.settings.magpie_voice
        if model == "chatterbox":
            if not self.settings.chatterbox_url:
                raise NvidiaError("Chatterbox TTS is not configured")
            return self.settings.chatterbox_url, self.settings.chatterbox_voice
        raise NvidiaOutputError()

    @staticmethod
    def _raise_for_status(response: httpx.Response, *, context: str) -> None:
        if response.status_code == 429:
            raise NvidiaRateLimitError()
        if response.is_error:
            logger.error(
                "NVIDIA %s returned %s: %s",
                context,
                response.status_code,
                response.text[:500],
            )
            raise NvidiaError()
