import { describe, expect, it } from 'vitest';
import { buildDevPackets, summarizeDevPackets } from '../services/devPacketService';

describe('devPacketService', () => {
  it('groups audit findings into Codex-ready packets', () => {
    const auditReport = {
      id: 'repo-audit-1',
      findings: [
        {
          id: 'finding-1',
          path: 'src/components/ProductionReadinessPanel.jsx',
          lineNumber: 42,
          surface: 'ui',
          kind: 'placeholder',
          priority: 'P1',
          message: 'Replace placeholder export button with a real path.',
          excerpt: 'Export Logs Placeholder'
        },
        {
          id: 'finding-2',
          path: 'src-tauri/src/lib.rs',
          lineNumber: 5019,
          surface: 'release',
          kind: 'setup_required',
          priority: 'P0',
          message: 'Updater release artifacts are setup-required.',
          excerpt: 'inspect_updater_release'
        }
      ]
    };

    const packets = buildDevPackets({
      auditReport,
      readinessReport: {
        releaseState: { state: 'setup_required' },
        repoAuditSummary: { issueCount: 1, needsSetupCount: 1 }
      }
    });

    expect(packets).toHaveLength(2);
    expect(packets[0].priority).toBe('P0');
    expect(packets[0].testCommands).toContain('npm.cmd run release:updater');
    expect(packets[1].priority).toBe('P1');
    expect(packets[1].files).toContain('src/components/ProductionReadinessPanel.jsx');
    expect(summarizeDevPackets(packets)).toEqual({ count: 2, p0: 1, p1: 1, p2: 0 });
  });
});
