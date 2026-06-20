# YouTube Connector Setup

Status: live upload path is wired in this build using YouTube Data API v3 `videos.insert`.

Security and approval rules:

- Keep OAuth secrets in `.env` only.
- Do not commit real credentials.
- Route user intent through Jose first.
- Keep risky external publishing behind visible approval.
- Log all upload attempts to connector audit.

Required environment variables:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_CHANNEL_ID`

Runtime behavior:

1. Connector refreshes OAuth access token from Google.
2. Connector uploads local video file with metadata to `videos.insert`.
3. Connector returns:
   - `videoId`
   - `https://www.youtube.com/watch?v=<videoId>`
4. Jose can include that URL in final confirmation back to Shayan.

Current limits:

- Inbound YouTube webhook/event ingestion is not wired yet.
- Upload progress callbacks/chunked resume are not wired yet.
- This is a supervised/manual connector action, not autonomous posting.
