import { appendConnectorAuditEntry, getConnectorAuditLog, getLastEntryForConnector } from '../services/connectorAuditLogService';

describe('connectorAuditLogService', () => {
  beforeEach(() => {
    // Drain the ring buffer by reading and checking length
    // The module uses a shared in-memory array; we can't reset it,
    // but we can account for pre-existing entries.
  });

  describe('appendConnectorAuditEntry + getConnectorAuditLog', () => {
    it('appends an entry and makes it retrievable', () => {
      const before = getConnectorAuditLog().length;
      appendConnectorAuditEntry({ connectorId: 'telegram', ok: true, latencyMs: 120, errorCode: null });
      const after = getConnectorAuditLog();
      expect(after.length).toBe(before + 1);
      const last = after[after.length - 1];
      expect(last.connectorId).toBe('telegram');
      expect(last.ok).toBe(true);
      expect(last.latencyMs).toBe(120);
      expect(last.errorCode).toBeNull();
      expect(typeof last.ts).toBe('number');
    });

    it('sets errorCode to null when not provided', () => {
      appendConnectorAuditEntry({ connectorId: 'notion', ok: false, latencyMs: 0 });
      const log = getConnectorAuditLog();
      const entry = log[log.length - 1];
      expect(entry.errorCode).toBeNull();
    });

    it('returns a copy — mutations do not affect internal log', () => {
      appendConnectorAuditEntry({ connectorId: 'test_immutable', ok: true, latencyMs: 1 });
      const copy = getConnectorAuditLog();
      copy.push({ fake: true });
      expect(getConnectorAuditLog().at(-1)).not.toHaveProperty('fake');
    });
  });

  describe('getLastEntryForConnector', () => {
    it('returns the most recent entry for a connector', () => {
      appendConnectorAuditEntry({ connectorId: 'whatsapp', ok: true, latencyMs: 50 });
      appendConnectorAuditEntry({ connectorId: 'whatsapp', ok: false, latencyMs: 300, errorCode: 'TIMEOUT' });
      const last = getLastEntryForConnector('whatsapp');
      expect(last).not.toBeNull();
      expect(last.ok).toBe(false);
      expect(last.errorCode).toBe('TIMEOUT');
    });

    it('returns null for an unknown connector', () => {
      expect(getLastEntryForConnector('connector_that_was_never_called')).toBeNull();
    });
  });
});
