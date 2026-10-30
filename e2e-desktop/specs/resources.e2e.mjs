// Resource manager (2026-10-30): the real app reads this computer's memory.
// Runtime Hub's Memory section shows RAM (and graphics memory, or says it is
// unknown), the top-bar meter opens it, and a tool Alphonso starts is listed as
// started by Alphonso with an idle time that is saved. The ComfyUI check needs
// Alphonso's own ComfyUI installed in this test profile, so it skips otherwise.
import { enterShell, invoke, openPage } from '../helpers.mjs';

const GPU_UNKNOWN = 'Graphics memory unknown on this computer.';

async function sectionText() {
  return browser.execute(() => document.querySelector('[data-testid="memory-section"]')?.textContent || '');
}

describe('Alphonso desktop memory', function () {
  this.timeout(240000);

  before(async () => {
    await enterShell();
  });

  it('the top-bar meter shows RAM and opens the Memory section', async () => {
    const meter = await $('[data-testid="memory-meter"]');
    await meter.waitForDisplayed({ timeout: 60000 });
    expect(await meter.getText()).toMatch(/RAM \d+\/\d+ GB/);
    await meter.click();
    const section = await $('[data-testid="memory-section"]');
    await section.waitForDisplayed({ timeout: 30000 });
  });

  it('the Memory section shows real numbers', async () => {
    const ram = await $('[data-testid="memory-ram"]');
    await ram.waitForDisplayed({ timeout: 30000 });
    const ramText = await ram.getText();
    const used = Number((ramText.match(/RAM: ([\d.]+) GB of ([\d.]+) GB used/) || [])[2]);
    expect(used).toBeGreaterThan(0);
    const gpuText = await $('[data-testid="memory-gpu"]').getText();
    expect(gpuText === GPU_UNKNOWN || /Graphics memory: [\d.]+ GB of [\d.]+ GB used/.test(gpuText)).toBe(true);
  });

  it('a tool Alphonso starts is listed as started by Alphonso, and its idle time is saved', async function () {
    const statuses = await invoke('runtime_get_all_status');
    const comfy = (statuses.ok ? statuses.value || [] : []).find((s) => s.name === 'comfyui');
    if (!comfy?.installed || comfy.running) {
      console.log('[resources] skipped: Alphonso\'s own ComfyUI is not installed (or already running) in this test profile.');
      this.skip();
    }
    const started = await invoke('runtime_start_tool', { name: 'comfyui' });
    expect(started.ok).toBe(true);
    try {
      await openPage('system', 'runtimes');
      const row = await $('[data-testid="memory-row-comfyui"]');
      await row.waitForDisplayed({ timeout: 120000 });
      expect(await row.getText()).toContain('Started by Alphonso');
      const idle = await $('[data-testid="memory-idle-comfyui"]');
      await idle.selectByAttribute('value', '5');
      const saved = await browser.execute(() => window.localStorage.getItem('alphonso_tool_idle_v1'));
      expect(JSON.parse(saved || '{}').comfyui).toBe(5);
      expect(await sectionText()).toContain('ComfyUI');
    } finally {
      await invoke('runtime_stop_tool', { name: 'comfyui' });
    }
  });
});
