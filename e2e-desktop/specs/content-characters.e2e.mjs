// Characters and motion (Miya content factory phase 4c, 2026-10-24), in the real app, with
// Zero-Cost Mode on: nothing is sent to Higgsfield. A real person can't be trained until the
// permission tick; a made-up character gets 8 pictures from Miya when ComfyUI is running
// (skipped otherwise); a motion clip is saved into the project's motion folder by the real
// backend, and a clip longer than 10 seconds is refused. The file dialog behind "Choose a
// video…" can't be driven by WebDriver, so the clip goes in as a recording does; the backend
// runs the same length and video checks for both.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enterShell, invoke, openPage, buttonByText } from '../helpers.mjs';

const VENDOR_FFMPEG = path.resolve('src-tauri/vendor/ffmpeg');
function tool(name) {
  const bundled = path.join(VENDOR_FFMPEG, process.platform === 'win32' ? `${name}.exe` : name);
  if (fs.existsSync(bundled)) return bundled;
  try {
    execFileSync(name, ['-version'], { stdio: 'ignore', windowsHide: true });
    return name;
  } catch {
    return null;
  }
}
async function comfyRunning() {
  try {
    return (await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}
const savedBrands = async () => JSON.parse(await browser.execute(() => localStorage.getItem('alphonso_content_brands_v1') || '[]'));

describe('Alphonso desktop: characters and motion', function () {
  // Hooks' limits are set here: this harness ignores this.timeout() inside a hook (QA batch 1).
  this.timeout(300000);
  let outputFolder = '';

  before(async function () {
    await enterShell();
    outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'alphonso-characters-'));
    await browser.execute((folder) => {
      const now = Date.now();
      const settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
      localStorage.setItem('alphonso_settings', JSON.stringify({ ...settings, outputFolder: folder, zeroCostMode: true }));
      const pictures = [1, 2, 3, 4, 5].map((n) => `acme/characters/sam/p${n}.png`);
      localStorage.setItem('alphonso_content_brands_v1', JSON.stringify([{
        id: 'acme', name: 'Acme', folderName: 'acme', palette: ['#30a46c'], fonts: '', logo: '', tone: '', audience: '', visualStyle: '', characterRefs: '',
        voice: { engine: 'kokoro', voiceId: 'af_heart' }, platforms: ['Instagram'], schedule: '', postingSlots: [], honestyRules: '', references: [],
        lessons: [], pastScripts: '', qualityThreshold: 7, createdAtMs: now, updatedAtMs: now,
        characters: [
          { id: 'sam', name: 'Sam', kind: 'real_person', description: 'Short dark hair, green jacket', pictures },
          { id: 'pip', name: 'Pip', kind: 'made_up', description: 'A small orange robot with round blue eyes', pictures: [] },
        ],
        mainCharacterId: 'sam',
      }]));
    }, outputFolder);
    await browser.refresh();
    await $('[data-alphonso-shell-ready="true"]').waitForExist({ timeout: 60000 });
    await openPage('work', 'miya');
    await (await buttonByText('brands')).click();
    await $('section[aria-label="Characters"]').waitForDisplayed({ timeout: 60000 });
  });

  after(() => {
    if (outputFolder) fs.rmSync(outputFolder, { recursive: true, force: true });
  });

  it("a real person can't be trained until the permission tick", async function () {
    const train = async () => $('//section[@aria-label="Characters"]//*[.//input[@aria-label="Character name: Sam"]]//button[normalize-space(.)="Train on Higgsfield"]');
    expect(await (await train()).isEnabled()).toBe(false);
    await (await $('input[aria-label="This is me, or I have this person\'s permission"]')).click();
    await browser.waitUntil(async () => Boolean((await savedBrands())[0].characters.find((c) => c.id === 'sam').permission?.atMs), { timeout: 10000, timeoutMsg: 'the permission was not saved with its date' });
    await browser.waitUntil(async () => (await train()).isEnabled(), { timeout: 10000, timeoutMsg: 'Train stayed off after the tick' });
  }).timeout(60000);

  it('a made-up character gets 8 pictures from Miya when ComfyUI runs', async function () {
    if (!(await comfyRunning())) this.skip();
    await (await $('//section[@aria-label="Characters"]//*[.//input[@aria-label="Character name: Pip"]]//button[normalize-space(.)="Make pictures with Miya"]')).click();
    await browser.waitUntil(async () => (await savedBrands())[0].characters.find((c) => c.id === 'pip').pictures.length === 8, {
      timeout: 1700000, interval: 5000, timeoutMsg: 'Miya did not make 8 pictures',
    });
    const first = (await savedBrands())[0].characters.find((c) => c.id === 'pip').pictures[0];
    expect(fs.existsSync(path.join(outputFolder, ...first.split('/')))).toBe(true);
  }).timeout(1800000);

  it('a motion clip is saved into the motion folder, and one over 10 seconds is refused', async function () {
    const ffmpeg = tool('ffmpeg');
    if (!ffmpeg) this.skip();
    const clip = (seconds) => {
      const file = path.join(outputFolder, `source-${seconds}s.mp4`);
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=s=640x360:d=${seconds}`, '-pix_fmt', 'yuv420p', file], { windowsHide: true });
      return fs.readFileSync(file).toString('base64');
    };
    const save = async (seconds, outPath) => (await invoke('content_save_motion_clip', { request: { workspaceRoot: outputFolder, outPath, base64: clip(seconds) } })).value || {};

    const kept = await save(3, 'acme/p1/motion/s1-v1.mp4');
    expect(kept.ok).toBe(true);
    expect(fs.existsSync(path.join(outputFolder, 'acme', 'p1', 'motion', 's1-v1.mp4'))).toBe(true);

    const refused = await save(12, 'acme/p1/motion/s2-v1.mp4');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('The clip is longer than 10 seconds.');
    expect(fs.existsSync(path.join(outputFolder, 'acme', 'p1', 'motion', 's2-v1.mp4'))).toBe(false);
  }).timeout(300000);
});
