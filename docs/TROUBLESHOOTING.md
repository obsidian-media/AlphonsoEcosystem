# Troubleshooting

## Ollama Issues

### "Ollama is not running"
```bash
# Start Ollama
ollama serve

# Or on macOS/Linux, it may already be running as a service
# Check with:
curl http://localhost:11434/api/tags
```

### "No models installed"
```bash
ollama pull llama3.2:3b
```

### Ollama is slow or timing out
- Check available RAM — llama3.2:3b needs ~4GB
- Close other applications
- Try a smaller model: `ollama pull llama3.2:1b`
- Check if GPU acceleration is available: `ollama run llama3.2:3b "hello"` should respond quickly

### "Could not reach Ollama"
1. Verify Ollama is running: `curl http://localhost:11434/api/tags`
2. Check firewall settings
3. Try restarting Ollama: stop the process and run `ollama serve` again

### Desktop app: chat replies stay empty, header says "Ollama offline" while Ollama is running

Ollama answers the desktop window with `403 Forbidden`. On Windows the window's origin is `http://tauri.localhost`, which is not on Ollama's default allow-list.

- From v2.10.0, chat no longer stays empty here: Alphonso sends the conversation through its backend when the window is refused, so you get a reply, all at once instead of streamed. The steps below give you streamed replies again.
- From v2.9.0, an Ollama that Alphonso starts itself is configured correctly. Close any Ollama you started yourself (tray app, `ollama serve`) and let Alphonso start it, or use Runtimes > Ollama > Start.
- To keep your own Ollama running, start it with the window origin allowed:

  ```powershell
  $env:OLLAMA_ORIGINS="http://tauri.localhost"
  ollama serve
  ```

  Do not add `tauri://localhost` to `OLLAMA_ORIGINS`: Ollama refuses to start ("bad origin"), and it already allows that scheme.

## Image Generation Issues

### "Image generation failed" with ComfyUI running

Before v2.9.0 ComfyUI refused the app window's requests (403) and no image could be queued. Update to v2.9.0 or later, where the desktop app reaches ComfyUI through its backend.

In plain-browser dev mode (`npm run dev`) the window still calls ComfyUI directly, so ComfyUI must be started with `--enable-cors-header`.

### "Timed out waiting for ComfyUI image output"

The first image after ComfyUI starts has to load the model, which can take several minutes on a small GPU. Before every image Alphonso asks Ollama to free the graphics card, and it waits 15 minutes (5 in v2.9.0). A picture still being made after that is kept: retry the Image step, or press **Check again** in Miya Studio, and the finished picture is picked up instead of starting again.

### ComfyUI makes no image, or Alphonso can't find it

- Settings → Runtime → ComfyUI lists every ComfyUI found on this computer; **Search this computer** looks through your drives. Choose yours there, and set **ComfyUI address** if it isn't `http://127.0.0.1:8188`.
- A ComfyUI installed by Runtime Hub gets the PyTorch build for your NVIDIA driver and the starter image model. One without an image model can't make a picture: pick or add a model in Settings → Runtime → ComfyUI → Image model.

### Content Studio or Creative Studio shows a "built-in template" notice

The model's reply could not be used, and the notice says why. Check that Ollama is running and a model is selected in Chat, then generate again.

## Build Issues

### Desktop build fails with "Found version mismatched Tauri packages"

The `tauri` crate in `src-tauri/Cargo.lock` and the `@tauri-apps/api` / `@tauri-apps/cli` npm packages must be on the same major.minor. Bump whichever is behind. Since 2026-10-21 PRs check this too (`npm run verify:tauri-versions` in Test & Build), so it should fail before the desktop build does.


### `npm install` fails
```bash
# Clear cache and retry
npm cache clean --force
npm install --legacy-peer-deps
```

### `npm run tauri dev` fails
```bash
# Check Rust is installed
rustc --version

# Update Rust
rustup update

# Check Tauri CLI
npx tauri --version

# On Windows, ensure WebView2 is installed
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

### Build hangs or runs out of memory
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

## Runtime Issues

### App freezes on startup
- This was fixed in v1.0.3 — make sure you're on the latest release
- Heavy startup work is deferred to prevent a UI freeze
- Installed copies check for updates at launch and install them in the app

### WebView2 zombie process (Windows)
- Fixed in v1.0.2 — window close now calls `std::process::exit(0)`
- If you see lingering processes, kill them via Task Manager

### Chat not responding
1. Check Ollama is running and a model is loaded
2. Check the Ollama status indicator in the top bar
3. Try switching models in Settings
4. Check browser console (F12) for errors

### Connectors showing "setup_required" or failing verification
1. Go to **Settings → Connectors** and enter your credentials in the input fields, then **Save**
2. Use **Test** in the Connector Health Monitor. "Live check passed" means the service itself answered; "key found" means only that a key is saved (nothing was sent). Each key shows as "saved", "environment only" or "missing".
3. If it still fails, the reason says what is missing or what the service said; double-check the values (no extra spaces)
4. See [CONNECTORS.md](./CONNECTORS.md) for per-connector credential names

> **Note**: you do NOT need to set OS environment variables. Keys saved in Settings are kept in the system keychain and used directly (since 2026-10-21 for every connector; before that, a few still needed an environment variable).

### Connector shows "Not set up" after saving credentials (pre-v2.2.3)
In older versions, the connector verification checked OS environment variables instead of the UI credential store. Upgrade to v2.2.3+ to fix this permanently. Workaround: add credentials to the OS environment and restart the app.

### Chat doesn't scroll to new messages
- Fixed in v2.2.3 — upgrade to the latest version
- Auto-scroll now fires by default; it was previously opt-in (broken by default)

### Jose pipeline results / approval buttons not visible in chat (v2.2.3+)
- All results now appear inline in the chat thread, directly below the last assistant message
- Scroll down within the chat window to see pipeline receipts, approval buttons, and Nova insights
- If results still don't appear, check the Ollama status — the pipeline requires Ollama to be running

### Approval modal keeps appearing
- This is by design — Approval Mode is on by default
- Settings → General → **What asks first** has a switch per kind of step. Spending, publishing or sending, and deleting always ask, even with Approval Mode off
- Commands that only read (such as `ollama list`) never ask

## Test Issues

### Tests fail
```bash
# Run all tests
npm run test

# Run with verbose output
npm run test -- --reporter=verbose

# Run a specific test file
npm run test -- src/test/policyEnforcementService.test.js
```

### Rust tests fail
```bash
cd src-tauri
cargo test
cargo clippy -- -D warnings
```

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `credentials are missing` | Connector key not saved | Add it in Settings → Connectors |
| `action blocked by policy` | Zero-cost or approval mode blocking | Check Settings |
| `agent not allowed` | Agent contract violation | Check AGENT_GUIDE.md |
| `dead_letter` state | Orchestration packet failed | Check Runtimes → Activity, or the request on the Requests board |
| `plan_rejected` | Jose's plan broke the rules (a step waiting for itself, a missing step, an agent doing what it may not) | The reason lists each problem; Jose usually falls back to the simple plan, or edit the plan on the board |
| `budget_exceeded` | A request went over 50 steps or its time limit | Split the request, or plan it again |
| `WAL mode` errors | SQLite concurrent access | Restart the app |

## Jose and the Requests Board

| Symptom | Cause | Fix |
|---------|-------|-----|
| A request shows a plan card and does nothing | Bigger requests show their plan first | Press **Run this plan** (Chat or the board), or change Settings → General → Show Jose's plan first |
| A request stops with "Waiting for you" | A step asks first (spend, publish or send, delete, or what you switched on in What asks first) | Approve it in Chat, on the board (**Approve and carry on**) or on Telegram |
| A request shows **Interrupted** | The app closed while it ran | Press **Carry on** on the board, in Chat or on Telegram; finished steps are kept, a step that asks asks again |
| A waiting request shows **Expired** | It waited longer than Settings → Approvals → Waiting requests expire after (7 days to start) | Ask again, or set 0 for never |
| A paid model is never used | Allow paid models is off, Zero-Cost Mode is on, the connector isn't set up, or the prices aren't entered | Settings → Approvals → Allow paid models says which one |
| Telegram doesn't pair | `TELEGRAM_ALLOWED_CHAT_IDS` is empty | Add your chat id in Settings → Connectors → Telegram, then send `/start` |
| A Telegram button says "That button has expired." | It was older than 7 days, or the request ended | Open the request on the board |

## Miya Studio (content factory)

| Message or symptom | Fix |
|---------|-----|
| "Choose an output folder in Settings first, then ask again." | Set **Settings → Output folder**; projects are saved in `<output folder>/<brand>/<project>/` |
| "Approve the review in Miya Studio first." | The run waits after the script's reviews: approve them in Script Studio (or on the board or Telegram) |
| Voice-over: "Install Kokoro in Runtime Hub." | Runtimes → Kokoro → Install |
| Music step skipped | AudioCraft isn't installed: Runtimes → AudioCraft → Install (optional) |
| "No stock footage keys are set…" | Add a free Pexels, Pixabay or Coverr key in Connectors → Content & Productivity, or leave it: scene pictures are used |
| "Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors." | Runtimes → ComfyUI → Video models suggests one for your graphics card |
| "This graphics card has under 8 GB, so AI clips are made smaller and at most 3 seconds…" | Expected on small cards; choose full size in Runtime Hub → ComfyUI → Video models if you want to try |
| "Runway clips were not approved for this run…" / "Higgsfield clips weren't approved for this run." | Run AI clips again and approve the cost |
| A clip or picture says "Waiting for Higgsfield…" or is still in ComfyUI | Press **Check again**; it is fetched, never made twice |
| Characters: "Tick that this is you or that you have permission first." / "Add at least 5 pictures." | A real person needs the permission tick; every character needs 5–20 pictures |
| "Add your own photos for a real person." | Make pictures with Miya works only for made-up characters |
| "Install the character reference model in Runtime Hub to keep the character." | Runtimes → ComfyUI → Characters → Install (about 6 GB), or train the character on Higgsfield |
| Motion: "The clip is longer than 10 seconds." | Trim it, or record a move (it stops by itself at 10 s) |
| "Alphonso couldn't use the camera…" | Allow the camera in Windows Settings → Privacy → Camera, or choose a file |
| "This graphics card can't run local motion transfer; Higgsfield can." | Local motion needs about 8 GB of graphics memory |
| A Short: "Make the finished video first: a highlight or a cut is taken from it." | Run the Finished video step first |
| A step shows **Out of date** | An earlier step changed; run it again when you want (nothing reruns by itself) |
| "Higgsfield isn't set up: add your keys and a model id…" | Settings → Connectors → Higgsfield; paste the model ids from the Higgsfield Console |

## Publishing and the Calendar

| Message or symptom | Fix |
|---------|-----|
| "No posts are approved…" | Campaign Studio → Posts → **Approve and schedule** |
| "Sign in to YouTube again in Settings → Connectors: the sign-in has run out." | Press **Sign in to YouTube**. While your Google project is in Testing, Google ends the sign-in after about 7 days; publish the project and tick "My Google project is Published" |
| A YouTube video shows **Kept private by YouTube** | YouTube keeps uploads private for a Google project that hasn't passed its audit; Alphonso reminds you at the time with a link to make it public in YouTube Studio |
| A post shows **Post by hand** | It needs a public link (an Instagram carousel, or a Reel through Instagram Login) and no storage is set up. Its files and caption are in the project's `ready-to-post` folder; or set up Connectors → Your storage |
| A post shows **Waiting: daily limit** | Instagram's daily limit or Facebook's 30 Reels a day; it goes when there is room |
| A post shows **Check it** | It was cut off while sending; check the platform, then retry or cancel. It is never sent again blindly |
| Numbers show "Sign in again to see … numbers" | The account was signed in before reading numbers was asked for; sign in again (posting keeps working) |
| Moving a post asks first | It is already scheduled on YouTube or Facebook, and moving it changes it there |

## WhatsApp Issues

### Outbound messages not sending
1. Verify `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set in Settings → Connectors → WhatsApp
2. Check the connector UI shows green for those keys
3. Ensure the recipient number is in international format (digits only, e.g. `16474842752`)
4. Verify the access token has not expired — Meta tokens expire after ~60 days; regenerate from App Dashboard

### Inbound messages not arriving
1. Confirm `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` is set to `https://<your-railway-url>/queue/drain`
2. Confirm `WHATSAPP_VERIFY_TOKEN` matches the value set in Railway env vars
3. Confirm `WHATSAPP_ALLOWED_NUMBERS` contains the sender's number (digits only, no `+`)
4. Check Railway gateway health: `GET https://<your-railway-url>/health` — should return `"status": "ready"`
5. Verify Meta webhook subscription is pointing to `https://<your-railway-url>/webhook` and verified

### Gateway returns 403 on drain
The `WHATSAPP_VERIFY_TOKEN` in Alphonso must match the `WHATSAPP_VERIFY_TOKEN` env var in Railway. Both must be the same string.

### Messages blocked (sender not in allowlist)
WhatsApp sends numbers without a `+` prefix (e.g. `16474842752`). Your `WHATSAPP_ALLOWED_NUMBERS` list should also be digits-only. The gateway strips `+` automatically, but double-check the format.

| Error | Cause | Fix |
|-------|-------|-----|
| `WHATSAPP_ACCESS_TOKEN not set` | Missing credential | Add in Settings → Connectors → WhatsApp |
| `Gateway drain failed: HTTP 401` | Token mismatch | Match `WHATSAPP_VERIFY_TOKEN` in app and Railway |
| `Gateway drain failed: HTTP 404` | Wrong drain URL | Use `https://<url>/queue/drain` (not `/webhook`) |
| `sender_not_allowlisted` | Number not in allowlist | Add digits-only number to `WHATSAPP_ALLOWED_NUMBERS` |

## Voice OS Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Connection failed" in voice UI | Voice server not running | Start from Runtimes → Voice OS → Start (or the Voice page), or set `VOICE_OS_TOKEN` and run `python -m uvicorn main:app --host 127.0.0.1 --port 8766 --no-access-log` in `voice/backend/` |
| No transcription produced | Ollama not running or no model pulled | Ensure `ollama serve` is running and `ollama pull llama3.2:3b` completed |
| `ModuleNotFoundError: faster_whisper` | Python deps not installed | Run `pip install -r voice/backend/requirements.txt` in the voice venv |
| `ModuleNotFoundError: piper` | piper-tts not installed | Run `pip install piper-tts` |
| `webrtcvad` import error on Windows | MSVC build tools missing | Install [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) |
| Microphone permission denied | Browser security | Allow microphone in system settings; Tauri WebView requires explicit permission |
| High voice latency (>3s) | Model too large or slow hardware | Use `llama3.2:1b` in Ollama; set `beam_size=1` in `voice/backend/stt.py` (already default) |
| Voice server exits immediately | Port 8766 already in use | Kill existing process: `netstat -ano \| findstr 8766`, then `taskkill /PID <pid> /F` |
| Voice client connects then is rejected immediately | `VOICE_OS_TOKEN` not set for a manually started server | Launch Voice OS from Alphonso (it sets the token), or set the same `VOICE_OS_TOKEN` for the server and client |
| No audio playback | TTS model file missing | piper downloads the model on first use — ensure internet access for first run |
| `/health` returns 500 | Model preload failed | Check terminal output for STT/TTS errors; ensure Python 3.10+ and all deps installed |

## Hermes Agent Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hermes credential row shows "unreachable" after saving | Base URL wrong, or the Hermes profile isn't running | Confirm the profile's own `platforms.api_server.enabled: true` in its `config.yaml`, confirm the port matches, and confirm the profile process is actually running |
| Hermes tab is greyed out / disabled in Agent Providers | That agent has no saved (or no reachable) Hermes endpoint | Configure it first under Settings → Connectors → API Credentials → Hermes Agents, then return to Agent Providers |
| Model dropdown shows "Profile unreachable" | `/v1/models` request failed after credentials were saved | Re-check the profile is still running and the API key hasn't been rotated/regenerated on the Hermes side since you saved it |
| Chat/pipeline reply fails with a Hermes error instead of using Ollama | Expected — by design, a Hermes failure never silently falls back to a different agent's answer | Fix the underlying Hermes profile issue, or switch that agent's provider back to Ollama in Agent Providers |
| 401 from a Hermes profile after it worked before | The API key was regenerated on the Hermes side | Copy the new key from that profile's `config.yaml` and re-save it in Hermes Agents |

## Getting Help

1. Check [Runtimes → Activity](./AGENT_GUIDE.md#viewing-agent-activity) for audit logs, and the Requests board for a request's steps
2. Export diagnostics from Operator Dashboard → Export Diagnostics (turn on Settings → Desktop & UI → Developer mode to see the Operator Dashboard)
3. Check `docs/ALPHONSO_GROUND_TRUTH.md` for verified system state
4. Open an issue at https://github.com/obsidian-media/AlphonsoEcosystem/issues
