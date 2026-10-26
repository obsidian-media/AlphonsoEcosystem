// Agent phase 5: only Marcus's own step sends for him (src/services/marcus/), plus the low-level
// senders themselves; everything else asks Marcus (askMarcusToSend).
import { describe, it, expect } from 'vitest';

describe('Marcus is the only way out', () => {
  it('nothing outside marcus/ sends for Marcus', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files= [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'test') walk(p); } else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(p.replace(/\\/g, '/'));
      }
    };
    walk('src');
    const allowed = (f, fn) => f.includes('src/services/marcus/') || (fn === 'executeMarcusPublish' && f.endsWith('marcusPublishService.ts'))
      || (fn === 'executeComposioTool' && (f.endsWith('composioService.ts') || f.endsWith('skills/skillToolRun.ts')));
    const offenders = files.flatMap((f) => ['executeMarcusPublish', 'executeComposioTool'].filter((fn) => readFileSync(f, 'utf8').includes(`${fn}(`) && !allowed(f, fn)).map((fn) => `${f}: ${fn}`));
    expect(offenders).toEqual([]);
  });
});
