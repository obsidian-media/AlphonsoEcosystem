import { createSnapshot, restoreSnapshotById } from '../services/recoveryService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true })
}));

describe('Recovery restore behavior', () => {
  beforeEach(() => {
    localStorage.removeItem('alphonso_recovery_snapshots_v1');
  });

  it('restores payload by snapshot id', async () => {
    const payload = {
      settings: { endpoint: 'http://localhost:11434', approvalMode: true },
      ollamaStatus: { state: 'connected' }
    };

    const snapshot = await createSnapshot(payload);
    const restored = restoreSnapshotById(snapshot.id);

    expect(restored).toEqual(payload);
  });
});
