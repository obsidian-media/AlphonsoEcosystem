import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = join(PROJECT_ROOT, 'docs', 'handoff');
const OUTPUT_PATH = join(OUTPUT_DIR, 'ALPHONSO_OLLAMA_RUNTIME_PROOF_2026-05-23.json');
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
const PREFERRED_MODEL = 'llama3.2:3b';
const PROMPT = 'Reply with exactly: Alphonso Ollama runtime proof ok.';

function normalizeEndpoint(endpoint) {
  const raw = String(endpoint || DEFAULT_ENDPOINT).trim();
  return raw.replace(/\/+$/, '');
}

async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { response, data, text };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const endpoint = normalizeEndpoint(process.env.OLLAMA_ENDPOINT || DEFAULT_ENDPOINT);
  const startedAt = new Date().toISOString();

  const tags = await fetchJson(`${endpoint}/api/tags`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!tags.response.ok) {
    throw new Error(`Ollama /api/tags returned HTTP ${tags.response.status}`);
  }

  const models = Array.isArray(tags.data?.models) ? tags.data.models : [];
  const model = models.find((row) => row?.name === PREFERRED_MODEL)?.name
    || models.find((row) => row?.name)?.name
    || PREFERRED_MODEL;

  const generate = await fetchJson(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      stream: false
    })
  }, 90000);

  if (!generate.response.ok) {
    throw new Error(`Ollama /api/generate returned HTTP ${generate.response.status}`);
  }

  const responseText = String(generate.data?.response || '').trim();
  const proof = {
    runtime: 'ollama_local',
    endpoint,
    startedAt,
    finishedAt: new Date().toISOString(),
    model,
    models: models.map((row) => row?.name).filter(Boolean),
    prompt: PROMPT,
    response: responseText,
    transport: 'frontend_http',
    ok: Boolean(responseText)
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ outputPath: OUTPUT_PATH, proof }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[verify-ollama-runtime] Failed: ${String(error)}\n`);
  process.exit(1);
});
