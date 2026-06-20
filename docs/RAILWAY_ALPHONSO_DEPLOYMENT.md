# ALPHONSO Railway Deployment

Known Railway app URL:

- https://function-bun-production-916e.up.railway.app

Current repo deployment config:

- `railway.json`
- Builder: `RAILPACK`
- Build command: `npm run build`
- Start command: `node scripts/serve-static.mjs`
- Healthcheck path: `/health`

Notes:

- This static web deployment should not receive local `.env` secrets unless a specific cloud feature is intentionally enabled.
- Local/private connectors such as Ollama, ComfyUI, Notion local env, and Coach/SessionGuard bridge should remain browser/local-first unless explicitly promoted.
- Deploy only after local `npm run lint`, focused tests, and `npm run build` pass.
