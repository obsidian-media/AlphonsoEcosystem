import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App.tsx — Session History nav wiring', () => {
  it('has a render branch for the session_history tab', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/activeTab === 'session_history'/);
  });

  it('lazy-imports SessionHistoryView with the named-export mapping App.tsx requires', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(
      /lazy\(\(\) => import\('\.\/components\/SessionHistoryView'\)\.then\(\(mod\) => \(\{ default: mod\.SessionHistoryView \}\)\)\)/
    );
  });
});
