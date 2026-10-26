// Agent phase 5: Composio is one of Marcus's channels. Reading (search mail, list tickets) is a
// skill tool; sending or changing something is a prepared Marcus step whose content comes from
// the written text, never from his model.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));
vi.mock('../../../services/composioService', async (orig) => ({
  ...(await orig() as object),
  isComposioEnabled: vi.fn(() => true),
  listToolkitTools: vi.fn(),
  executeComposioTool: vi.fn(),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { listToolkitTools, executeComposioTool } from '../../../services/composioService';
import { runSkillTool } from '../../../services/skills/skillToolRun';
import { pickDestination } from '../../../services/marcus/pickDestination';
import { runMarcusSend } from '../../../services/marcus/runSend';
import { composioSendTools } from '../../../services/marcus/composioChannel';

const llm = vi.mocked(generateAgentLlmResponse);
const GMAIL = [
  { name: 'GMAIL_SEND_EMAIL', description: 'Send an email', toolkit: 'gmail', parameters: { properties: { recipient_email: {}, subject: {}, body: {} } }, enabled: true, tags: [] },
  { name: 'GMAIL_FETCH_EMAILS', description: 'Fetch emails', toolkit: 'gmail', parameters: { properties: { query: {} } }, enabled: true, tags: [] },
];
const REQ = '/jose Write a thank-you note and email it to anna@example.com through Gmail';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem('alphonso_composio_toolkits_enabled_v1', JSON.stringify(['gmail']));
  vi.mocked(listToolkitTools).mockResolvedValue({ tools: GMAIL as never, error: null });
});

describe('composio_read', () => {
  it('runs only read-only tools, fenced', async () => {
    vi.mocked(executeComposioTool).mockResolvedValue({ success: true, data: { messages: [{ subject: 'Hi' }] }, error: null });
    const read = await runSkillTool('composio_read', { toolkit: 'gmail', tool: 'GMAIL_FETCH_EMAILS', args: { query: 'from:anna' } }, { agent: 'hector' } as never);
    expect(read.ok).toBe(true);
    expect(read.text).toMatch(/untrusted/i);
    expect(read.text).toContain('Hi');
    expect(executeComposioTool).toHaveBeenCalledWith('GMAIL_FETCH_EMAILS', { query: 'from:anna' }, { toolkit: 'gmail', approved: false });
    const send = await runSkillTool('composio_read', { toolkit: 'gmail', tool: 'GMAIL_SEND_EMAIL', args: {} }, { agent: 'hector' } as never);
    expect(send).toEqual({ ok: false, text: "composio_read only reads; GMAIL_SEND_EMAIL sends or changes something, so it is Marcus's step." });
  });
});

describe('Composio as a Marcus destination', () => {
  it('lists only send tools of switched-on toolkits', async () => {
    expect((await composioSendTools()).map((t) => t.name)).toEqual(['GMAIL_SEND_EMAIL']);
  });

  it("a send tool's content comes from the written text, never the model's", async () => {
    llm.mockResolvedValueOnce({ response: JSON.stringify({ connector: 'composio', tool: 'GMAIL_SEND_EMAIL', target: 'anna@example.com', arguments: { recipient_email: 'anna@example.com', subject: 'Thanks', body: 'MODEL WROTE THIS', bcc: 'x@y.z' } }) } as never);
    const got = await pickDestination(REQ, 'Thank you for your help, Anna.', {});
    expect(got).toMatchObject({ ok: true, destination: { connector: 'composio', target: 'anna@example.com', kind: 'composio_action', label: 'Composio, gmail',
      composio: { toolkit: 'gmail', tool: 'GMAIL_SEND_EMAIL', args: { recipient_email: 'anna@example.com', subject: 'Thanks', body: 'Thank you for your help, Anna.' } } } });
    expect(JSON.stringify(got)).not.toContain('bcc');
  });

  it('a recipient not named in the request is refused', async () => {
    llm.mockResolvedValue({ response: JSON.stringify({ connector: 'composio', tool: 'GMAIL_SEND_EMAIL', target: 'boss@example.com', arguments: { recipient_email: 'boss@example.com' } }) } as never);
    expect((await pickDestination(REQ, 'Thanks.', {})).ok).toBe(false);
  });

  it('a read tool is not a destination', async () => {
    llm.mockResolvedValue({ response: JSON.stringify({ connector: 'composio', tool: 'GMAIL_FETCH_EMAILS', target: 'anna@example.com', arguments: {} }) } as never);
    expect((await pickDestination(REQ, 'Thanks.', {})).ok).toBe(false);
  });

  it('runMarcusSend executes exactly the prepared tool, approved', async () => {
    vi.mocked(executeComposioTool).mockResolvedValue({ success: true, data: {}, error: null });
    const r = await runMarcusSend('', 'marcus', {
      connector: 'composio', target: 'anna@example.com', kind: 'composio_action', label: 'Composio, gmail', text: 'Thanks.', sourceStepId: 'write', preparedAtMs: 1,
      composio: { toolkit: 'gmail', tool: 'GMAIL_SEND_EMAIL', args: { recipient_email: 'anna@example.com', body: 'Thanks.' } },
    } as never);
    expect(executeComposioTool).toHaveBeenCalledWith('GMAIL_SEND_EMAIL', { recipient_email: 'anna@example.com', body: 'Thanks.' }, { toolkit: 'gmail', approved: true });
    expect(r).toMatchObject({ ok: true, sentence: 'Done on Composio, gmail: send email to anna@example.com.' });
  });
});
