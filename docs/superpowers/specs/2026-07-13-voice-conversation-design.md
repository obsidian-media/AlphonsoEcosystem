# Voice Conversation Design

## Goal

Make Alphonso's iOS Voice tab a dependable push-to-talk conversation for both
Local and Cloud modes. Every completed voice turn must produce a spoken reply
when a capable provider is available, while retaining the transcript and a
clear status if playback cannot occur.

## Scope

- Push-to-talk only. Continuous listening, wake words, and in-utterance
  bilingual recognition are out of scope.
- Local and Cloud modes share conversation behavior but keep their separate
  transports and model providers.
- Users explicitly choose one of the nine agents. Alphonso is the default.
- English and Persian/Farsi (`en-US`, `fa-IR`) can be changed between turns in
  the same conversation. Existing supported languages remain available.
- The selected agent's role and constraints affect prompts and display, but do
  not bypass agent contracts or policy enforcement.

## Architecture

### Shared voice policy

Introduce a single, versioned voice-conversation policy used by both backends.
It requires short, natural spoken replies; asks a focused follow-up only when
needed; avoids generic model self-descriptions; honors the selected language;
and preserves a bounded turn history. The policy is combined with the selected
agent's persona at request time.

### Agent profile boundary

Voice consumes a small profile contract:

```text
agentId, displayName, roleSummary, voicePersona, contractReference
```

The voice feature is responsible only for selecting and presenting a profile
and adding its voice persona to a model request. The canonical allowed and
blocked actions remain owned by `agentContractService` and the policy gate.
Cloud mode is conversational only; it must not execute tools. Local mode
continues to use the existing command and policy path.

This boundary allows a future agent-contract change to be developed and
committed independently, without concurrent edits to voice files.

### Local flow

1. User chooses an agent and language, then starts push-to-talk.
2. The iOS recognizer captures one utterance in the selected locale.
3. The companion sends the transcript plus voice context to the desktop.
4. The desktop invokes the selected agent through its existing authorization
   path and returns a response.
5. iOS appends the assistant turn and uses an available local system voice for
   that locale. If no local voice is available, it leaves the text visible and
   explains the playback limitation.

### Cloud flow

1. iOS sends the transcript, selected agent, language, bounded history, and
   selected TTS preference to the Railway Cloud Voice endpoint.
2. The endpoint creates the reply using the shared policy and agent persona.
3. It selects a TTS provider that supports the requested language and returns
   a validated audio payload.
4. iOS decodes and starts playback before the turn is considered successful.

## Language and speech routing

The selected language applies to one push-to-talk utterance. A user may change
it before the next utterance without clearing conversation history. The app
checks iOS `SFSpeechRecognizer.supportedLocales()` and current availability
before enabling recording in that locale.

- NVIDIA Magpie/Chatterbox remain eligible only for their documented locales.
- `fa-IR` cloud synthesis uses Azure Speech (`fa-IR-DilaraNeural` or
  `fa-IR-FaridNeural`) through a dedicated provider adapter.
- The UI describes the actual active provider and voice. It never labels a
  turn as spoken when no compatible audio provider exists.
- Mixed Farsi and English inside a single uninterrupted utterance is not a
  release guarantee. Switching language between turns is.

## iOS experience

- Add an agent picker to Voice, defaulting to Alphonso.
- Keep the language picker and add Persian/Farsi.
- Show Listening, Thinking, Speaking, Ready, and Failed states.
- Stop/clear cancels recording and audio playback.
- If a response has text but playback fails, retain the transcript, show a
  specific error, and provide a retry-audio action when audio is available.

## Error handling

- Unsupported speech locale: block recording and state the device limitation.
- Unsupported cloud TTS locale: choose the configured compatible provider or
  return a visible provider error.
- Model, network, decode, or playback failure: preserve the user turn, do not
  claim success, restore a usable ready/error state, and make retry possible.
- Responses are length-limited for speech; long model answers are summarized
  or requested in concise spoken form by the shared policy.

## Testing and release evidence

- Unit-test shared policy construction, agent selection, language/provider
  selection, response validation, and voice-session state transitions.
- Add backend tests for policy presence, agent fields, Azure Farsi routing,
  unsupported locales, and invalid audio payloads.
- Add iOS tests for Farsi entry/state, agent selection, speaking completion,
  playback failure, and per-turn language switching.
- Deploy Cloud Voice only after a real authenticated `fa-IR` request returns
  valid audio and plays on a physical iPhone; repeat for an NVIDIA-supported
  English request.

## Out of scope

- Continuous duplex conversation, voice cloning, wake words, and automatic
  agent routing.
- Executing Cloud-mode agent actions.
- Making promises about Farsi speech on devices or providers that do not
  report support at runtime.
