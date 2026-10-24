# YouTube Connector Setup

Status: upload, scheduling, thumbnails, moving and cancelling scheduled videos, and reading each video's numbers are wired (YouTube Data API v3 and YouTube Analytics). Miya Studio's Publish step and the Calendar use them. Not checked with a real account yet.

Security and approval rules:

- Enter keys in **Settings → Connectors**. They are kept in your system's keychain, never in localStorage, backups or exports. A variable in the app's environment still works as a fallback; a `.env` file is read only in development runs.
- Do not commit credentials.
- Every upload asks first (publishing always asks), and only Marcus publishes.
- All upload attempts are logged to the connector audit.

Credentials (Settings → Connectors → YouTube):

- `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` — an OAuth client (Desktop app) in your own Google Cloud project, with the YouTube Data API v3 and YouTube Analytics API enabled
- `YOUTUBE_REFRESH_TOKEN` — saved for you by **Sign in to YouTube**
- `YOUTUBE_CHANNEL_ID`

Signing in:

1. Paste the client ID and secret, then press **Sign in to YouTube**. Your browser opens; Alphonso receives the sign-in on `127.0.0.1:8085` for 5 minutes. If the browser can't come back, paste the address it ended on.
2. While the Google project is in **Testing**, Google ends the sign-in after about 7 days and keeps uploads private. Alphonso warns 2 days before. Publish the project in Google Cloud and tick **My Google project is Published**.
3. `npm run auth:youtube` is still there for developers.

Runtime behavior:

1. A video more than 15 minutes ahead is uploaded early as private with a publish time; otherwise it goes public now. The first finished thumbnail is set.
2. If YouTube keeps it private (it does for a project that hasn't passed its audit), the post shows **Kept private by YouTube** and Marcus reminds you at its time with a link to make it public in YouTube Studio.
3. Moving a scheduled video on the Calendar changes it on YouTube first; cancelling removes the schedule (it stays private on your channel).
4. Its numbers are read 1 hour, 1 day, 7 days and 30 days after it goes out.

Current limits:

- Inbound YouTube webhook/event ingestion is not wired.
