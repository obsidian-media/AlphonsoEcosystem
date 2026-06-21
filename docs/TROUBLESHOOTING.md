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

## Build Issues

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
- This was fixed in v1.0.3 — ensure you're on the latest version (v2.0.2)
- Heavy startup work is now deferred to prevent UI freeze
- The auto-updater will notify you of new versions automatically (requires v2.0.2+ installed)

### WebView2 zombie process (Windows)
- Fixed in v1.0.2 — window close now calls `std::process::exit(0)`
- If you see lingering processes, kill them via Task Manager

### Chat not responding
1. Check Ollama is running and a model is loaded
2. Check the Ollama status indicator in the top bar
3. Try switching models in Settings
4. Check browser console (F12) for errors

### Connectors showing "setup_required"
1. Add required env vars to `.env` (copy from `.env.example`)
2. Restart the app
3. Verify in the Connector Setup panel that env keys are green
4. See [CONNECTORS.md](./CONNECTORS.md) for per-connector setup

### Approval modal keeps appearing
- This is by design — Approval Mode is on by default
- Disable in Settings → Approval Mode (not recommended for production use)
- Or approve the action and it won't ask again for that specific action type

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
| `credentials are missing` | Connector env vars not set | Add to `.env` and restart |
| `action blocked by policy` | Zero-cost or approval mode blocking | Check Settings |
| `agent not allowed` | Agent contract violation | Check AGENT_GUIDE.md |
| `dead_letter` state | Orchestration packet failed | Check Activity tab for details |
| `WAL mode` errors | SQLite concurrent access | Restart the app |

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

## Getting Help

1. Check the [Activity tab](./AGENT_GUIDE.md#viewing-agent-activity) for audit logs
2. Export diagnostics from Operator Dashboard → Export Diagnostics
3. Check `docs/ALPHONSO_GROUND_TRUTH.md` for verified system state
4. Open an issue at https://github.com/Thatisshayan/AlphonsoEcosystem/issues
