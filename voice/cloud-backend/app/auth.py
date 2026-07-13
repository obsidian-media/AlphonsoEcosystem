from fastapi import HTTPException


def require_bearer_token(authorization: str | None, expected_token: str) -> None:
    if not expected_token:
        raise HTTPException(status_code=503, detail="Cloud voice service is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing voice cloud auth token")
    if authorization.removeprefix("Bearer ").strip() != expected_token:
        raise HTTPException(status_code=403, detail="Invalid voice cloud auth token")
