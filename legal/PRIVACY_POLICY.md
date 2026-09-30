# Alphonso Privacy Policy

> **DRAFT for legal review.** Fill in every `[BRACKETED]` field and have counsel review this before launch. The factual statements below describe what the code does as of v2.8.0 (2026-09-30). Re-check them whenever data flows change.

_Last updated: [DATE]_

[LEGAL ENTITY NAME] ("we") publishes the Alphonso desktop app and the Alphonso Companion iOS app. This policy explains what data they process and where it goes.

## 1. Local-first by default

The desktop app runs AI models on your own computer through a bundled Ollama runtime. Your chats, memory, agent activity, settings and files stay on your device, in the app's local storage and SQLite database. We do not operate servers that receive them. We do not use advertising or tracking, and the desktop app sends no analytics or telemetry.

Crash and error logs are stored only on your device. They are never uploaded automatically.

## 2. Services you choose to connect

If you add credentials for a third-party service, Alphonso sends that service the data needed to do what you asked. Examples include OpenAI, Anthropic, Google Gemini, NVIDIA NIM, DeepSeek, Perplexity, Tavily, Brave Search, Telegram, WhatsApp, Slack, Discord, GitHub, Notion, ClickUp, YouTube, Runway, CALL-E, Composio and n8n. Each provider handles that data under its own privacy policy.

Your credentials are stored in your operating system's secure credential store where one is available.

Paid, metered and high-risk connectors are blocked until you approve them. This is controlled by the app's Zero-Cost Mode and Approval Mode.

## 3. Cloud Voice (optional, iOS)

Cloud Voice is an optional service in the iOS Companion app. It is invite-only. If you use it, we process:

| Data | Why | Where |
|---|---|---|
| Email address | Sign-in (one-time code) | Supabase (authentication), [SUPABASE REGION] |
| Device identifier (random UUID) and device name | Enrolling your iPhone | Supabase |
| The text of your voice turns and recent conversation history | Generating a reply and its audio | Our API on AWS ([AWS REGION]); the text is sent to NVIDIA NIM for language-model and speech processing |
| Language-learning "weakness" notes (Tutor mode) | Personalising lessons | Supabase |

Your speech is converted to text on your iPhone by Apple's speech recognition, which Apple may process under its own privacy policy. Our servers receive that text, not your recorded audio. Replies come back as synthesized audio.

**Retention:** device enrollments and learning notes are kept until you delete your account. [STATE LOG RETENTION FOR AWS/NVIDIA REQUEST LOGS.]

**Deleting your account:** open Voice → **Delete Cloud Voice account**. This permanently removes your account, enrolled devices and learning history. If you used the Atlas preview, its audit receipts are kept as an anonymized audit trail: the link to your deleted account is removed.

## 4. Mobile companion pairing

Pairing the iOS app with your desktop happens over your local network after you turn on mobile pairing on the desktop. It uses a short-lived PIN. This traffic does not pass through our servers.

## 5. Updates

The desktop app checks GitHub Releases (github.com) for signed updates. GitHub receives your IP address as part of that request, under GitHub's privacy policy.

## 6. Children

Alphonso is not directed to children under [13/16]. We do not knowingly collect their data.

## 7. Your rights

Depending on where you live, you may have the right to access, correct, delete or export your data. Most data never leaves your device. For Cloud Voice data, use in-app deletion or contact us at [CONTACT EMAIL].

## 8. Changes

We will update this page and change the "Last updated" date when our practices change.

## 9. Contact

[LEGAL ENTITY NAME] — [POSTAL ADDRESS] — [CONTACT EMAIL]
