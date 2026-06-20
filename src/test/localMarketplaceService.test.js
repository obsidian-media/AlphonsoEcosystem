import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const {
  listMarketplaceItems,
  setMarketplaceItemStatus,
  getRemoteCatalogueUrl,
  setRemoteCatalogueUrl,
  fetchRemoteCatalogue,
  DEFAULT_CATALOGUE_URL
} = await import('../services/localMarketplaceService.js');

describe('localMarketplaceService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listMarketplaceItems', () => {
    it('seeds default items when localStorage is empty', () => {
      const items = listMarketplaceItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('includes all 9 default items', () => {
      const items = listMarketplaceItems();
      expect(items.length).toBeGreaterThanOrEqual(9);
    });

    it('includes Jose Orchestrator Agent', () => {
      const items = listMarketplaceItems();
      const ids = items.map((i) => i.id);
      expect(ids).toContain('item.agent.jose');
    });

    it('includes Telegram connector', () => {
      const items = listMarketplaceItems();
      const ids = items.map((i) => i.id);
      expect(ids).toContain('item.connector.telegram');
    });

    it('returns stored items when they exist', () => {
      const custom = [{ id: 'custom.item', name: 'Custom', type: 'skill_pack', status: 'available' }];
      localStorage.setItem('alphonso_local_marketplace_registry_v1', JSON.stringify(custom));
      const items = listMarketplaceItems();
      const ids = items.map((i) => i.id);
      expect(ids).toContain('custom.item');
    });

    it('merges missing defaults into existing stored items', () => {
      localStorage.setItem('alphonso_local_marketplace_registry_v1', JSON.stringify([]));
      const items = listMarketplaceItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('default items have trust and updatedAtMs fields', () => {
      const items = listMarketplaceItems();
      const item = items[0];
      expect(item).toHaveProperty('trust');
      expect(item).toHaveProperty('updatedAtMs');
    });

    it('persists seeded items to localStorage', () => {
      listMarketplaceItems();
      const raw = localStorage.getItem('alphonso_local_marketplace_registry_v1');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).length).toBeGreaterThan(0);
    });
  });

  describe('setMarketplaceItemStatus', () => {
    it('updates status of a specific item', () => {
      const items = setMarketplaceItemStatus('item.agent.jose', 'disabled');
      const jose = items.find((i) => i.id === 'item.agent.jose');
      expect(jose.status).toBe('disabled');
    });

    it('does not affect other items', () => {
      const items = setMarketplaceItemStatus('item.agent.jose', 'disabled');
      const miya = items.find((i) => i.id === 'item.agent.miya');
      expect(miya.status).not.toBe('disabled');
    });

    it('sets updatedAtMs on the changed item', () => {
      const before = Date.now();
      const items = setMarketplaceItemStatus('item.agent.jose', 'installed');
      const jose = items.find((i) => i.id === 'item.agent.jose');
      expect(jose.updatedAtMs).toBeGreaterThanOrEqual(before);
    });

    it('persists the update to localStorage', () => {
      setMarketplaceItemStatus('item.connector.telegram', 'configured');
      const raw = localStorage.getItem('alphonso_local_marketplace_registry_v1');
      const stored = JSON.parse(raw);
      const telegram = stored.find((i) => i.id === 'item.connector.telegram');
      expect(telegram.status).toBe('configured');
    });

    it('returns the full updated list', () => {
      const items = setMarketplaceItemStatus('item.agent.jose', 'installed');
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('getRemoteCatalogueUrl', () => {
    it('returns the default URL when nothing is stored', () => {
      const url = getRemoteCatalogueUrl();
      expect(url).toBe(DEFAULT_CATALOGUE_URL);
    });

    it('returns a stored custom URL', () => {
      localStorage.setItem('alphonso_marketplace_catalogue_url_v1', 'https://example.com/catalogue.json');
      const url = getRemoteCatalogueUrl();
      expect(url).toBe('https://example.com/catalogue.json');
    });

    it('DEFAULT_CATALOGUE_URL is a GitHub raw URL', () => {
      expect(DEFAULT_CATALOGUE_URL).toContain('raw.githubusercontent.com');
      expect(DEFAULT_CATALOGUE_URL).toContain('catalogue.json');
    });
  });

  describe('setRemoteCatalogueUrl', () => {
    it('stores a valid URL', () => {
      setRemoteCatalogueUrl('https://example.com/plugins.json');
      expect(localStorage.getItem('alphonso_marketplace_catalogue_url_v1')).toBe('https://example.com/plugins.json');
    });

    it('throws on empty string', () => {
      expect(() => setRemoteCatalogueUrl('')).toThrow('Invalid catalogue URL');
    });

    it('throws on null', () => {
      expect(() => setRemoteCatalogueUrl(null)).toThrow('Invalid catalogue URL');
    });

    it('throws on non-string', () => {
      expect(() => setRemoteCatalogueUrl(42)).toThrow('Invalid catalogue URL');
    });

    it('subsequent getRemoteCatalogueUrl returns the set value', () => {
      setRemoteCatalogueUrl('https://my-server.com/catalogue.json');
      expect(getRemoteCatalogueUrl()).toBe('https://my-server.com/catalogue.json');
    });
  });

  describe('fetchRemoteCatalogue', () => {
    const mockCatalogue = {
      schema_version: '1.0.0',
      updated_at: '2026-06-20',
      items: [
        {
          id: 'skillpack.daily-summary',
          name: 'Daily Summary',
          type: 'skill_pack',
          status: 'available',
          version: '1.0.0',
          author: 'Obsidian Media'
        }
      ]
    };

    it('returns items array on successful fetch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCatalogue)
      }));

      const items = await fetchRemoteCatalogue('https://example.com/catalogue.json');
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('skillpack.daily-summary');
    });

    it('uses getRemoteCatalogueUrl when no URL argument is passed', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCatalogue)
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchRemoteCatalogue();
      expect(fetchMock).toHaveBeenCalledWith(
        DEFAULT_CATALOGUE_URL,
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('throws on non-ok HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      }));

      await expect(fetchRemoteCatalogue('https://example.com/catalogue.json'))
        .rejects.toThrow('Catalogue fetch failed: 404');
    });

    it('throws when items field is missing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ schema_version: '1.0.0' })
      }));

      await expect(fetchRemoteCatalogue('https://example.com/catalogue.json'))
        .rejects.toThrow('Invalid catalogue format');
    });

    it('throws when items is not an array', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: 'not-an-array' })
      }));

      await expect(fetchRemoteCatalogue('https://example.com/catalogue.json'))
        .rejects.toThrow('Invalid catalogue format');
    });

    it('throws when response body is null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null)
      }));

      await expect(fetchRemoteCatalogue('https://example.com/catalogue.json'))
        .rejects.toThrow('Invalid catalogue format');
    });

    it('propagates network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      await expect(fetchRemoteCatalogue('https://example.com/catalogue.json'))
        .rejects.toThrow('Network error');
    });

    it('returns multiple items from catalogue', async () => {
      const multi = {
        ...mockCatalogue,
        items: [
          { id: 'a', name: 'A', type: 'skill_pack', status: 'available' },
          { id: 'b', name: 'B', type: 'theme', status: 'available' }
        ]
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(multi)
      }));

      const items = await fetchRemoteCatalogue('https://example.com/catalogue.json');
      expect(items).toHaveLength(2);
    });
  });
});
