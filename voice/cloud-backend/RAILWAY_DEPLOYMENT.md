# Railway Cloud Voice Deployment

Create a new Railway service in the existing Alphonso project with the service
root set to `voice/cloud-backend`. Railway reads the service-local
`railway.json`, builds with Railpack, starts Uvicorn, and checks `/ready`.

Set these Railway variables in the Cloud Voice service only:

- `NVIDIA_API_KEY`: the NVIDIA Build API key.
- `NVIDIA_NIM_BASE_URL`: `https://integrate.api.nvidia.com/v1`.
- `NVIDIA_NIM_MODEL`: the selected NVIDIA NIM chat model.
- `NVIDIA_TTS_MAGPIE_URL` and `NVIDIA_TTS_MAGPIE_DEFAULT_VOICE`.
- `NVIDIA_TTS_CHATTERBOX_URL` and `NVIDIA_TTS_CHATTERBOX_DEFAULT_VOICE` when
  the Chatterbox deployment endpoint has been verified. These are optional for
  Magpie-only production operation.
- `PIPER_FARSI_URL`: private Piper Farsi service URL.
- `PIPER_SERVICE_TOKEN`: shared secret used only between Cloud Voice and the
  private Piper service.
- `PIPER_FARSI_DEFAULT_VOICE`: `mana` by default; `manta` is also supported.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase publishable/anonymous key. Cloud Voice pairs it
  with the authenticated user's JWT, so the existing `voice_devices` RLS
  policies enforce enrollment and lookup ownership. Do not configure a
  service-role key for this service.

Do not commit these values. The iOS app must not ask a user for a Cloud Voice
URL, NVIDIA key, or Piper token. Cloud Voice authorizes each request through
the Supabase user session and active enrolled-device record; do not introduce a
second shared bearer token without a client-safe issuance and rotation design.

**No auth bypass exists or should be reintroduced.** An earlier build shipped
a `VOICE_ALLOW_OWNER_TESTING_BYPASS` env var that skipped
`SupabaseDeviceRegistry.require_active_device()` on `/v1/voice/respond` for a
short owner-test window; it was left enabled in a deployed image for over a
week before being removed from source on 2026-08-10 (see
`docs/governance/DEFERRED_WORK.md`). `/v1/voice/respond` now unconditionally
requires an active Supabase device on every request — do not set that
variable in Railway/ECS, it no longer does anything, and do not add a
replacement flag that skips device enforcement even temporarily.

## Supabase device enrollment

Apply `supabase/migrations/20260713214554_cloud_voice_devices.sql` before
deploying Cloud Voice. The iPhone uses the public Supabase URL and publishable
key to sign in with an email one-time code, stores its session in Keychain, and
enrolls its generated device UUID at `POST /v1/voice/devices/enroll`. Each
voice request then requires the Supabase user access token and
`X-Alphonso-Device-Id`; Cloud Voice rejects revoked or unknown devices.

Before production release, issue a real authenticated English/NVIDIA request
and a Persian/Piper request. Verify a valid WAV response, selected `agent`,
`language`, and `tts_provider`; then verify playback on a real iPhone.
Chatterbox remains optional until its NVIDIA endpoint is explicitly verified.
