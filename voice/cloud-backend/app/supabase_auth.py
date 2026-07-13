from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.config import Settings


@dataclass(frozen=True)
class SupabaseUser:
    id: str


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing user access token")
    return authorization.removeprefix("Bearer ").strip()


class SupabaseDeviceRegistry:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def user_from_authorization(self, authorization: str | None) -> SupabaseUser:
        token = _bearer_token(authorization)
        if not self.settings.supabase_url or not self.settings.supabase_service_role_key:
            raise HTTPException(status_code=503, detail="Cloud device enrollment is not configured")
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{self.settings.supabase_url}/auth/v1/user",
                headers={"apikey": self.settings.supabase_service_role_key, "Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired user access token")
        user_id = response.json().get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User identity is missing")
        return SupabaseUser(id=str(user_id))

    async def enroll(self, user: SupabaseUser, device_id: str, display_name: str) -> None:
        UUID(device_id)
        payload = {"user_id": user.id, "device_id": device_id, "display_name": display_name, "revoked_at": None}
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{self.settings.supabase_url}/rest/v1/voice_devices?on_conflict=user_id,device_id",
                headers={
                    "apikey": self.settings.supabase_service_role_key,
                    "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates",
                },
                json=payload,
            )
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=503, detail="Could not enroll this device")

    async def require_active_device(self, authorization: str | None, device_id: str | None) -> SupabaseUser:
        if not device_id:
            raise HTTPException(status_code=401, detail="Missing device identifier")
        try:
            UUID(device_id)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid device identifier") from error
        user = await self.user_from_authorization(authorization)
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{self.settings.supabase_url}/rest/v1/voice_devices",
                params={"select": "id", "user_id": f"eq.{user.id}", "device_id": f"eq.{device_id}", "revoked_at": "is.null", "limit": "1"},
                headers={"apikey": self.settings.supabase_service_role_key, "Authorization": f"Bearer {self.settings.supabase_service_role_key}"},
            )
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=403, detail="This device is not enrolled for Cloud Voice")
        return user
