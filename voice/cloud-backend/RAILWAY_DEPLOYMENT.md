# Railway Cloud Voice Deployment

Create a new Railway service in the existing Alphonso project with the service
root set to `voice/cloud-backend`. Railway reads the service-local
`railway.json`, builds with Railpack, starts Uvicorn, and checks `/ready`.

Set these Railway variables in the Cloud Voice service only:

- `VOICE_CLOUD_API_KEY`: a generated application-to-service bearer token.
- `NVIDIA_API_KEY`: the NVIDIA Build API key.
- `NVIDIA_NIM_BASE_URL`: `https://integrate.api.nvidia.com/v1`.
- `NVIDIA_NIM_MODEL`: the selected NVIDIA NIM chat model.
- `NVIDIA_TTS_MAGPIE_URL` and `NVIDIA_TTS_MAGPIE_DEFAULT_VOICE`.
- `NVIDIA_TTS_CHATTERBOX_URL` and `NVIDIA_TTS_CHATTERBOX_DEFAULT_VOICE` when
  the Chatterbox deployment endpoint has been verified. These are optional for
  Magpie-only production operation.

Do not commit these values. After Railway reports `/ready` as healthy, copy the
public HTTPS service URL plus `/v1/voice/respond` into the iOS Cloud backend
field. Enter `VOICE_CLOUD_API_KEY` in the iOS Cloud API key field; the app
migrates it into Keychain and removes the legacy UserDefaults value.

Before production release, issue a real authenticated Magpie request and verify
that its response contains valid WAV audio and plays on a real iOS device. The
Chatterbox endpoint and voice setting must be verified against the enabled
NVIDIA deployment before declaring that option complete.
