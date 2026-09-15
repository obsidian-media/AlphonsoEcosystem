# Cloud Voice is intentionally stateless: Supabase owns device state and
# NVIDIA/Piper remain external providers during the first AWS migration phase.
#
# Build context for this Dockerfile is `voice/` (the parent of cloud-backend/),
# not cloud-backend/ itself -- it needs to reach voice/shared/voice_policy.json,
# which lives outside cloud-backend/. See app/voice_policy.py for the matching
# runtime path resolution.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Debian's slim image may already provide the `voice` system group.  Support
# either base-image state while retaining a non-root runtime account.
RUN getent group voice >/dev/null || groupadd --system voice; \
    id -u voice >/dev/null 2>&1 || useradd --system --gid voice --home-dir /app voice

COPY cloud-backend/requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY cloud-backend/app ./app
COPY shared ./shared

USER voice
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8080\")}/health', timeout=3)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
