import { appendConnectorAuditEntry, getConnectorAuditLog, getLastEntryForConnector } from '../services/connectorAuditLogService';

describe('connectorAuditLogService', () => {
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

    it('preserves entry ordering by append time', () => {
      appendConnectorAuditEntry({ connectorId: 'order_test_1', ok: true, latencyMs: 10 });
      appendConnectorAuditEntry({ connectorId: 'order_test_2', ok: true, latencyMs: 20 });
      const log = getConnectorAuditLog();
      const idx1 = log.findIndex((e) => e.connectorId === 'order_test_1');
      const idx2 = log.findIndex((e) => e.connectorId === 'order_test_2');
      expect(idx1).toBeLessThan(idx2);
    });

    it('includes errorCode when provided', () => {
      appendConnectorAuditEntry({ connectorId: 'error_test', ok: false, latencyMs: 500, errorCode: 'ECONNREFUSED' });
      const log = getConnectorAuditLog();
      const entry = log[log.length - 1];
      expect(entry.errorCode).toBe('ECONNREFUSED');
    });
  });

  describe('ring buffer behavior — max 100 entries', () => {
    it('evicts oldest entries when exceeding 100', () => {
      const initialLength = getConnectorAuditLog().length;
      const entriesToAdd = 110 - initialLength;
      if (entriesToAdd > 0) {
        for (let i = 0; i < entriesToAdd; i++) {
          appendConnectorAuditEntry({ connectorId: `filler_${i}`, ok: true, latencyMs: i });
        }
      }
      const log = getConnectorAuditLog();
      expect(log.length).toBeLessThanOrEqual(100);
      const hasFiller = log.some((e) => e.connectorId === 'filler_0');
      expect(hasFiller).toBe(false);
    });

    it('does not grow beyond 100 with repeated appends', () => {
      for (let i = 0; i < 50; i++) {
        appendConnectorAuditEntry({ connectorId: `spam_${i}`, ok: true, latencyMs: 1 });
      }
      expect(getConnectorAuditLog().length).toBeLessThanOrEqual(100);
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

    it('returns only the last entry for the connector, not earlier ones', () => {
      appendConnectorAuditEntry({ connectorId: 'multi_test', ok: true, latencyMs: 10 });
      appendConnectorAuditEntry({ connectorId: 'other', ok: true, latencyMs: 20 });
      appendConnectorAuditEntry({ connectorId: 'multi_test', ok: false, latencyMs: 30 });
      const last = getLastEntryForConnector('multi_test');
      expect(last.latencyMs).toBe(30);
      expect(last.ok).toBe(false);
    });

    it('returns null when the connector was evicted from ring buffer', () => {
      for (let i = 0; i < 98; i++) {
        appendConnectorAuditEntry({ connectorId: `filler_${i}`, ok: true, latencyMs: 1 });
      }
      appendConnectorAuditEntry({ connectorId: 'evicted_connector', ok: true, latencyMs: 42 });
      for (let i = 0; i < 100; i++) {
        appendConnectorAuditEntry({ connectorId: `pusher_${i}`, ok: true, latencyMs: 1 });
      }
      const result = getLastEntryForConnector('evicted_connector');
      expect(result).toBeNull();
    });
  });

  describe('multiple connectors', () => {
    it('tracks entries across different connectors independently', () => {
      appendConnectorAuditEntry({ connectorId: 'connector_a', ok: true, latencyMs: 100 });
      appendConnectorAuditEntry({ connectorId: 'connector_b', ok: false, latencyMs: 200, errorCode: 'FAIL' });
      const lastA = getLastEntryForConnector('connector_a');
      const lastB = getLastEntryForConnector('connector_b');
      expect(lastA.ok).toBe(true);
      expect(lastB.ok).toBe(false);
      expect(lastA.latencyMs).toBe(100);
      expect(lastB.latencyMs).toBe(200);
    });

    it('isolates connector lookups — different connectors do not interfere', () => {
      appendConnectorAuditEntry({ connectorId: 'isolation_a', ok: true, latencyMs: 10 });
      appendConnectorAuditEntry({ connectorId: 'isolation_b', ok: true, latencyMs: 20 });
      expect(getLastEntryForConnector('isolation_a').latencyMs).toBe(10);
      expect(getLastEntryForConnector('isolation_b').latencyMs).toBe(20);
    });
  });
});
