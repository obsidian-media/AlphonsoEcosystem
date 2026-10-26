// Agent roles Part A in the real app (2026-10-24): every step goes to the agent
// who owns its kind of work, Jose does none of the work himself, a review
// gives its verdict with the review, and the request ends with the closing
// summary ("Open on the board."). Nothing is sent. Skipped without a local
// model; uses qwen2.5:7b when installed (small models write unusable plans more often).
import { enterShell, invoke, ollamaHasModels, warmSelectedModel, clickSend } from '../helpers.mjs';

const PREFERRED_TEST_MODEL = 'qwen2.5:7b';
// The task-type prefixes each agent owns (src/services/jose/agentPermissionTable.ts).
const OWNS = {
  jose: ['orchestration_', 'remote_message_route', 'boardroom_', 'cost_policy_'],
  alphonso: ['local_operation', 'verification_', 'runtime_', 'assistant_', 'execute_command', 'filesystem_'],
  miya: ['creative_', 'design_'],
  hector: ['research', 'source_', 'citation_'],
  maria: ['governance_', 'audit_', 'approval_', 'policy_', 'risk_'],
  marcus: ['approved_', 'distribution_', 'engagement_', 'performance_', 'outreach_'],
  echo: ['memory_', 'retention_', 'knowledge_', 'timeline_'],
  sentinel: ['security_', 'permission_'],
  nova: ['opportunity_', 'analysis_', 'prioritization_', 'strategy_'],
};

async function installedModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/** The test never approves anything: any approval window is denied. */
async function denyAnyApproval() {
  const deny = await $('button[aria-label="Deny action"]');
  if (await deny.isExisting() && await deny.isDisplayed()) await deny.click();
}

async function lastReplyText() {
  const replies = await $$('[data-testid="chat-message-assistant"]');
  return replies.length ? replies[replies.length - 1].getText() : '';
}

async function lastRequest() {
  const requests = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_requests_v1') || '[]'));
  return requests.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))[0] || null;
}

describe('Alphonso desktop: each agent does only its own work', () => {
  before(async function () {
    await enterShell();
    if (!(await ollamaHasModels())) this.skip();
    this.timeout(400000);
    const extra = { showPlanFirst: 'never', ...((await installedModels()).includes(PREFERRED_TEST_MODEL) ? { selectedModel: PREFERRED_TEST_MODEL } : {}) };
    const loaded = await invoke('load_settings');
    const saved = JSON.parse((loaded.ok && loaded.value) || '{}');
    await invoke('save_settings', { settingsJson: JSON.stringify({ ...saved, ...extra }) });
    await browser.execute((values) => {
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, ...values }));
    }, extra);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await warmSelectedModel();
    await $('[data-testid="sidebar-chat-shortcut"]').click();
  });

  it('plans research, a post and a check with each step at its owner, and ends with the summary', async function () {
    const input = await $('[data-testid="chat-compose-input"]');
    await input.waitForDisplayed();
    await input.setValue('Research three facts about honeybees, write a short post about them, and have the post checked for accuracy. Do not send it anywhere.');
    await clickSend();

    await browser.waitUntil(async () => {
      await denyAnyApproval();
      const request = await lastRequest();
      return request && ['done', 'failed', 'waiting_approval', 'waiting_setup'].includes(request.status);
    }, { timeout: 1400000, interval: 3000, timeoutMsg: 'the request never finished' }).catch(async (e) => {
      const r = await lastRequest();
      console.log('AGENT-ROLES-DIAG reply', JSON.stringify(await lastReplyText()).slice(0, 1500));
      console.log('AGENT-ROLES-DIAG request', JSON.stringify(r && { status: r.status, plan: r.plan, steps: r.steps.map((x) => [x.stepId, x.agent, x.actionType, x.status, x.error]), log: r.changeLog }).slice(0, 3000));
      throw e;
    });

    const request = await lastRequest();
    console.log('AGENT-ROLES request', JSON.stringify({ status: request.status, steps: request.steps.map((s) => [s.stepId, s.agent, s.actionType, s.status, s.verdict]) }));
    for (const step of request.steps) {
      const owned = (OWNS[step.agent] || []).some((prefix) => step.actionType.startsWith(prefix));
      expect(owned).toBe(true);
    }
    // Jose plans; he has no work step of his own.
    expect(request.steps.some((s) => s.agent === 'jose' && !s.actionType.startsWith('boardroom_'))).toBe(false);
    // Nothing was sent.
    expect(request.steps.some((s) => s.agent === 'marcus' && s.status === 'done' && !/review|readiness/.test(s.actionType))).toBe(false);

    // A review that ran has a verdict from its own answer.
    const outputs = JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_jose_step_outputs_v1') || '{}'));
    const steps = outputs[request.commandId]?.steps || {};
    for (const review of request.steps.filter((s) => s.reviewOf && s.status === 'done')) {
      expect(['pass', 'fix']).toContain(review.verdict || steps[review.stepId]?.schema?.verdict);
    }

    // The closing summary: one line per step, then the board.
    await browser.waitUntil(async () => /Open on the board\./.test(await lastReplyText()) || request.steps.length === 1,
      { timeout: 60000, interval: 1000, timeoutMsg: 'Chat never showed the closing summary' });
    expect(await lastReplyText()).not.toMatch(/Jose merged/);
  }).timeout(1500000);
});
