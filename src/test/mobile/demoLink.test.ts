// Phone phase 3 part C (owner, 2026-11-02): "Try a demo" shows sample data in the real screens and
// sends nothing: no computer, no relay, nothing kept on the phone.
import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoLink, demoDataOptions, DEMO_REFUSED, DEMO_CHAT_REPLY, DEMO_BANNER } from '../../mobile/demo/demoLink';
import { createRemoteData } from '../../services/phone/remoteData';

function demo() {
  const link = createDemoLink(Date.UTC(2026, 10, 2, 9));
  const { parts, options } = demoDataOptions();
  const data = createRemoteData(link, parts, options);
  return { link, data };
}

describe('the demo link', () => {
  beforeEach(() => localStorage.clear());

  it('is online and gives the screens sample requests, chat and a Studio project', async () => {
    const { link, data } = demo();
    await data.reconnected();
    expect(link.online()).toBe(true);
    expect(link.offlineSince()).toBeNull();
    const waiting = data.board.requests().find((r) => r.status === 'waiting_approval');
    expect(waiting).toBeTruthy();
    const send = waiting!.steps.find((s: any) => s.status === 'waiting_approval') as any;
    expect(send.sendPreview.text.length).toBeGreaterThan(10);
    expect(data.board.requests().some((r) => r.status === 'done')).toBe(true);
    expect(data.chat.messages().length).toBeGreaterThanOrEqual(3);
    expect(data.studio.projects()).toHaveLength(1);
    expect(data.studio.calendar().length).toBeGreaterThanOrEqual(2);
  });

  it('approving, rejecting and every other action is refused', async () => {
    const { data } = demo();
    await data.reconnected();
    const waiting = data.board.requests().find((r) => r.status === 'waiting_approval')!;
    const step = waiting.steps.find((s: any) => s.status === 'waiting_approval')!;
    expect(await data.board.approveStep(waiting.id, step.stepId)).toBe(DEMO_REFUSED);
    expect(await data.board.rejectStep(waiting.id, step.stepId)).toBe(DEMO_REFUSED);
    for (const name of ['settings.set', 'team.run', 'content.approvePosts', 'connector.setEnabled'] as const) {
      expect(await data.more.call(name as any, {})).toEqual({ ok: false, reason: DEMO_REFUSED });
    }
  });

  it('a chat message gets the demo answer', async () => {
    const { data } = demo();
    await data.reconnected();
    await data.chat.send('Plan my week');
    const messages = data.chat.messages();
    expect(messages.some((m) => m.role === 'user' && m.text === 'Plan my week' && !m.queued)).toBe(true);
    expect(messages[messages.length - 1]).toMatchObject({ role: 'assistant', text: DEMO_CHAT_REPLY });
  });

  it("a Studio picture loads from the app itself", async () => {
    const { data } = demo();
    await data.reconnected();
    const picture = data.studio.projects()[0].media.find((m) => m.kind === 'picture')!;
    const result = await data.studio.preview(picture, async () => true);
    expect(result.ok).toBe(true);
    expect((result as { url: string }).url.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('nothing from the demo is kept on the phone', async () => {
    const { data } = demo();
    await data.reconnected();
    await data.chat.send('Hello');
    const kept = Object.keys(localStorage).filter((k) => k.startsWith('alphonso_phone'));
    expect(kept).toEqual([]);
  });

  it('reaches no computer, relay or push service', () => {
    const files = import.meta.glob('../../mobile/demo/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files)).toHaveLength(2);
    const source = Object.values(files).join(' ');
    expect(source).not.toMatch(/connectPhone|phoneAccount|phoneLink|relay|WebSocket|fetch\(/);
    expect(source).not.toMatch(/^import (?!type )[^;]*phoneSession/m);
    expect(DEMO_BANNER).toBe('Demo · sample data, nothing is sent');
  });
});
