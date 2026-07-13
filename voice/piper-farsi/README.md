# Private Piper Farsi service

This is a private Railway service used only by Cloud Voice. It downloads and
caches the public Farsi Piper models on first use, then returns WAV audio from
`POST /v1/synthesize`. Set `PIPER_SERVICE_TOKEN` in Railway and use the same
value in Cloud Voice's `PIPER_SERVICE_TOKEN`; do not expose either service to
the iOS client.

`mana` is the default voice. `manta` is a second selectable Farsi voice.
Review the upstream model cards and licenses before production use.
