# Cloud Voice is intentionally stateless: Supabase owns device state and
# NVIDIA/Piper remain external providers during the first AWS migration phase.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

RUN groupadd --system voice && useradd --system --gid voice --home-dir /app voice

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY app ./app

USER voice
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
