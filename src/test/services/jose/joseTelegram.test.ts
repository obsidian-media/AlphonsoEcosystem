import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectJoseNotifications, getJoseTelegramSettings, markSent, wasSent, seedSentLog,
  buttonToken, readButtonToken, type JoseNotification,
} from '../../../services/jose/joseTelegram';
import type { JoseRequest } from '../../../services/jose/joseRequestStore';

const ALL_ON = { stepWaiting: true, planWaiting: true, finished: true, reviewDecision: true };

function request(patch: Partial<JoseRequest>): JoseRequest {
  return {
    id: 'r1', commandId: 'c1', source: 'user', text: 'Post the launch video', kind: 'normal', status: 'running',
    steps: [], createdAtMs: 1000, updatedAtMs: 2000, changeLog: [], ...patch,
  } as JoseRequest;
}
const kinds = (list: JoseNotification[]) => list.map((n) => n.kind);

beforeEach(() => localStorage.clear());

describe('collectJoseNotifications', () => {
  it('says what a waiting step will do, with Approve and Reject', () => {
    const [n] = collectJoseNotifications([request({
      status: 'waiting_approval',
      steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [], instruction: 'Post the video to YouTube.', status: 'waiting_approval', startedAtMs: 5 }],
    })], new Set(), ALL_ON);
    expect(n.kind).toBe('step_waiting');
    expect(n.text).toBe('Marcus wants to publish or send anything outside: Post the video to YouTube.\nFor: Post the launch video');
    expect(n.buttons).toEqual([[
      { text: 'Approve', action: 'approve', requestId: 'r1', stepId: 'post' },
      { text: 'Reject', action: 'reject', requestId: 'r1', stepId: 'post' },
    ]]);
  });

  it('shows what a paid step should cost', () => {
    const [n] = collectJoseNotifications([request({
      status: 'waiting_approval',
      steps: [{ stepId: 'a-paid', agent: 'miya', actionType: 'creative_script', effects: ['write_own_work', 'spend'], needs: [], instruction: 'Write it.', model: 'claude:claude-haiku-5-5', costEstimateUsd: 0.0184, status: 'waiting_approval' }],
    })], new Set(), ALL_ON);
    expect(n.text).toMatch(/^Miya wants to create new files in the project folder, spend money: Write it\. \(about \$0\.02\)/);
  });

  it('lists a waiting plan with Run and Cancel', () => {
    const [n] = collectJoseNotifications([request({
      status: 'waiting_plan_approval',
      steps: [
        { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.', status: 'waiting' },
        { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'], instruction: 'Judge them.', status: 'waiting' },
      ],
    })], new Set(), ALL_ON);
    expect(n.kind).toBe('plan_waiting');
    expect(n.text).toBe("Jose's plan for: Post the launch video\n1. Hector: Find the facts.\n2. Nova: Judge them.");
    expect(n.buttons![0].map((b) => [b.text, b.action])).toEqual([['Run this plan', 'run'], ['Cancel', 'cancel']]);
  });

  it('sends one line when a request finishes or fails', () => {
    const list = collectJoseNotifications([
      request({ id: 'd', status: 'done' }),
      request({ id: 'f', status: 'failed', steps: [{ stepId: 'a', agent: 'nova', actionType: 'x', effects: ['read'], needs: [], status: 'failed', error: 'The model did not answer.' }] }),
    ], new Set(), ALL_ON);
    expect(list.map((n) => n.text)).toEqual(['Done: Post the launch video', 'Failed: Post the launch video — The model did not answer.']);
    expect(list.every((n) => !n.buttons)).toBe(true);
  });

  it('does not send a finished line for each content-factory step (they are steps of a project)', () => {
    expect(collectJoseNotifications([request({ status: 'done', source: 'content-factory' })], new Set(), ALL_ON)).toEqual([]);
  });

  it('passes on a review that asks you to decide', () => {
    const [n] = collectJoseNotifications([request({
      status: 'running',
      changeLog: [{ atMs: 9, text: 'The review still found problems after 2 rounds: The hook is weak. Tell me what to change, or use it as it is.' }],
    })], new Set(), ALL_ON);
    expect(n.kind).toBe('review_decision');
    expect(n.text).toMatch(/^Post the launch video: The review still found problems after 2 rounds/);
  });

  it('offers Carry on for a request cut off when the app closed', () => {
    const [n] = collectJoseNotifications([request({ status: 'interrupted' })], new Set(), ALL_ON);
    expect(n.text).toBe('Cut off when the app closed: Post the launch video');
    expect(n.buttons).toEqual([[{ text: 'Carry on', action: 'carry_on', requestId: 'r1' }]]);
  });

  it('skips what was sent and what you switched off', () => {
    const done = request({ status: 'done' });
    const [first] = collectJoseNotifications([done], new Set(), ALL_ON);
    expect(collectJoseNotifications([done], new Set([first.key]), ALL_ON)).toEqual([]);
    expect(collectJoseNotifications([done], new Set(), { ...ALL_ON, finished: false })).toEqual([]);
  });

  it('tells you again when a step waits again later', () => {
    const waiting = (startedAtMs: number) => request({ status: 'waiting_approval', steps: [{ stepId: 'post', agent: 'marcus', actionType: 'x', effects: ['publish_or_send'], needs: [], status: 'waiting_approval', startedAtMs }] });
    const [first] = collectJoseNotifications([waiting(5)], new Set(), ALL_ON);
    expect(kinds(collectJoseNotifications([waiting(9)], new Set([first.key]), ALL_ON))).toEqual(['step_waiting']);
  });
});

describe('the sent log', () => {
  it('is saved, so it survives a restart', () => {
    expect(wasSent('k')).toBe(false);
    markSent('k');
    expect(wasSent('k')).toBe(true);
  });

  it('counts what is already there as sent the first time, and only the first time', () => {
    const existing = [request({ id: 'old', status: 'done' })];
    expect(seedSentLog(existing)).toBe(true);
    expect(collectJoseNotifications(existing, new Set(JSON.parse(localStorage.getItem('alphonso_jose_telegram_sent_v1')!)), ALL_ON)).toEqual([]);
    expect(seedSentLog(existing)).toBe(false);
  });
});

describe('getJoseTelegramSettings', () => {
  it('has every kind on by default and reads what you switched off', () => {
    expect(getJoseTelegramSettings()).toEqual(ALL_ON);
    localStorage.setItem('alphonso_settings', JSON.stringify({ joseTelegram: { finished: false } }));
    expect(getJoseTelegramSettings()).toEqual({ ...ALL_ON, finished: false });
  });
});

describe('button tokens', () => {
  it('fit Telegram\'s 64 bytes and read back; an unknown or old one reads as null', () => {
    const token = buttonToken({ text: 'Approve', action: 'approve', requestId: 'jose-request-jose-command-1792735508296-67315d', stepId: 'a-very-long-step-id-fix-2' });
    expect(token).toMatch(/^j:[A-Za-z0-9]{8}$/);
    expect(new TextEncoder().encode(token).length).toBeLessThanOrEqual(64);
    expect(readButtonToken(token)).toEqual({ action: 'approve', requestId: 'jose-request-jose-command-1792735508296-67315d', stepId: 'a-very-long-step-id-fix-2' });
    expect(readButtonToken('j:nothere1')).toBeNull();
    expect(readButtonToken('other')).toBeNull();
    expect(readButtonToken(token, Date.now() + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
