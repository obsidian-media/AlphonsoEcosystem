import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { persistContentJobsToSqlite, hydrateContentJobsFromSqlite } from '../../features/content-catalyst/services/contentPersistenceService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contentPersistenceService', () => {
  describe('persistContentJobsToSqlite', () => {
    it('calls kv_set with stringified jobs', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const jobs = [{ id: 'j1' }, { id: 'j2' }];
      await persistContentJobsToSqlite(jobs);
      expect(mockInvoke).toHaveBeenCalledWith('kv_set', {
        key: 'content_catalyst_jobs_v1',
        value: JSON.stringify(jobs),
      });
    });

    it('does not throw when invoke fails', async () => {
      mockInvoke.mockRejectedValue(new Error('bridge unavailable'));
      await expect(persistContentJobsToSqlite([{ id: 'j1' }])).resolves.not.toThrow();
    });
  });

  describe('hydrateContentJobsFromSqlite', () => {
    it('returns parsed jobs array', async () => {
      const jobs = [{ id: 'j1' }, { id: 'j2' }];
      mockInvoke.mockResolvedValue(JSON.stringify(jobs));
      const result = await hydrateContentJobsFromSqlite();
      expect(result).toEqual(jobs);
    });

    it('returns null when kv_get returns null', async () => {
      mockInvoke.mockResolvedValue(null);
      const result = await hydrateContentJobsFromSqlite();
      expect(result).toBeNull();
    });

    it('returns null when JSON is not an array', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({ not: 'array' }));
      const result = await hydrateContentJobsFromSqlite();
      expect(result).toBeNull();
    });

    it('returns null when invoke fails', async () => {
      mockInvoke.mockRejectedValue(new Error('bridge unavailable'));
      const result = await hydrateContentJobsFromSqlite();
      expect(result).toBeNull();
    });

    it('returns null when JSON is malformed', async () => {
      mockInvoke.mockResolvedValue('{bad json');
      const result = await hydrateContentJobsFromSqlite();
      expect(result).toBeNull();
    });
  });
});
