# Railway Cloud Voice Deployment

Create a new Railway service in the existing Alphonso project with the service
root set to `voice/cloud-backend`. Railway reads the service-local
`railway.json`, builds with Railpack, starts Uvicorn, and checks `/ready`.

Set these Railway variables in the Cloud Voice service only:

- `VOICE_CLOUD_API_KEY`: the server-side Cloud Voice bearer token. Do not copy
  this token into an iPhone build, a repository, or any user-facing field.
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
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase key used to validate the
  signed-in user and enforce enrolled-device access. Set this on Cloud Voice
  only, never as a shared Railway variable.

Do not commit these values. The iOS app must not ask a user for a Cloud Voice
URL, NVIDIA key, Piper token, or `VOICE_CLOUD_API_KEY`. Cloud Voice currently
requires a bearer token, but the existing local PIN pairing does **not** issue
or validate a durable per-device cloud credential. Treat cloud access from an
unpaired iPhone as blocked until a device-enrollment service is implemented.

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
