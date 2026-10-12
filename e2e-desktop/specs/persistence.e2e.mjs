// Proves the real SQLite-backed KV store keeps data across a full app
// restart. Uses one uniquely named probe key and removes it afterwards, so
// nothing is left in the developer's real app-data directory.
import { enterShell, invoke } from '../helpers.mjs';

const KEY = `e2e_desktop_probe_${Date.now()}`;
const VALUE = JSON.stringify({ written: 'by e2e-desktop/specs/persistence.e2e.mjs' });

describe('Alphonso desktop persistence', () => {
  before(enterShell);

  after(async () => {
    await invoke('kv_delete', { key: KEY });
  });

  it('writes and reads a value through the Rust KV store', async () => {
    expect(await invoke('kv_set', { key: KEY, value: VALUE })).toEqual({ ok: true, value: null });
    expect(await invoke('kv_get', { key: KEY })).toEqual({ ok: true, value: VALUE });
  });

  it('still has the value after the app is closed and relaunched', async () => {
    await browser.reloadSession();
    await enterShell();
    expect(await invoke('kv_get', { key: KEY })).toEqual({ ok: true, value: VALUE });
  });

  it('removes the value on delete', async () => {
    expect((await invoke('kv_delete', { key: KEY })).ok).toBe(true);
    expect(await invoke('kv_get', { key: KEY })).toEqual({ ok: true, value: null });
  });
});
