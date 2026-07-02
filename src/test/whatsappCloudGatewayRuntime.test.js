// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { resolve } from 'node:path';

const gatewayScript = resolve(process.cwd(), 'gateway', 'whatsapp-cloud', 'src', 'server.js');

let gatewayProcess = null;
let forwardServer = null;

function requestText({ port, path, method = 'GET', headers = {}, body }) {
  return new Promise((resolveResponse, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers
    };

    const request = httpRequest(options, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        resolveResponse({
          statusCode: response.statusCode,
          headers: response.headers,
          text
        });
      });
    });

    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function waitForGatewayPort(process) {
  return new Promise((resolvePort, rejectPort) => {
    let buffer = '';
    const cleanup = () => {
      process.stdout.off('data', onData);
      process.stderr.off('data', onErrorData);
      process.off('exit', onExit);
    };

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/"port":(\d+)/);
      if (match) {
        cleanup();
        resolvePort(Number(match[1]));
      }
    };

    const onErrorData = (chunk) => {
      buffer += chunk.toString('utf8');
    };

    const onExit = (code) => {
      cleanup();
      rejectPort(new Error(`gateway exited before ready (${code})`));
    };

    process.stdout.on('data', onData);
    process.stderr.on('data', onErrorData);
    process.once('exit', onExit);
  });
}

async function startForwardServer() {
  const requests = [];
  forwardServer = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolveReady) => forwardServer.listen(0, '127.0.0.1', resolveReady));
  const port = forwardServer.address().port;
  return { port, requests };
}

describe('WhatsApp Cloud gateway runtime smoke', () => {
  afterEach(async () => {
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill('SIGTERM');
      await once(gatewayProcess, 'exit').catch(() => {});
    }
    gatewayProcess = null;

    if (forwardServer) {
      await new Promise((resolveClose) => forwardServer.close(resolveClose));
      forwardServer = null;
    }
  });

  it('serves health, verifies challenge, and forwards a signed webhook payload', async () => {
    const { port: forwardPort, requests } = await startForwardServer();
    const forwardUrl = `http://127.0.0.1:${forwardPort}/forward`;

    gatewayProcess = spawn(process.execPath, [gatewayScript], {
      env: {
        ...process.env,
        PORT: '0',
        WHATSAPP_VERIFY_TOKEN: 'verify-token',
        WHATSAPP_APP_SECRET: 'gateway-secret',
        ALPHONSO_FORWARD_URL: forwardUrl,
        WHATSAPP_ALLOWLIST: '',
        WHATSAPP_RATE_MAX_REQUESTS: '5',
        WHATSAPP_RATE_WINDOW_MS: '1000',
        FORWARD_TIMEOUT_MS: '2000'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    gatewayProcess.stdout.setEncoding('utf8');
    gatewayProcess.stderr.setEncoding('utf8');

    const gatewayPort = await waitForGatewayPort(gatewayProcess);

    const health = await requestText({
      port: gatewayPort,
      path: '/health',
      method: 'GET'
    });
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.text)).toMatchObject({
      ok: true,
      status: 'ok'
    });

    const challenge = await requestText({
      port: gatewayPort,
      path: '/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123',
      method: 'GET'
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.text).toBe('challenge-123');

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '15551234567' },
                contacts: [{ profile: { name: 'Test Contact' } }],
                messages: [
                  {
                    id: 'wamid-runtime-1',
                    from: '15550000000',
                    timestamp: '12345',
                    type: 'text',
                    text: { body: 'Hello Alphonso' }
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = `sha256=${crypto.createHmac('sha256', 'gateway-secret').update(rawBody).digest('hex')}`;

    const webhook = await requestText({
      port: gatewayPort,
      path: '/webhook',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(rawBody.length),
        'x-hub-signature-256': signature
      },
      body: rawBody
    });

    expect(webhook.statusCode).toBe(200);
    const parsed = JSON.parse(webhook.text);
    expect(parsed).toMatchObject({
      ok: true,
      normalizedCount: 1
    });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].body)).toMatchObject({
      provider: 'whatsapp_cloud',
      from: '15550000000',
      to: '15551234567',
      text: 'Hello Alphonso'
    });
  });
});
