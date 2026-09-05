import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('App.tsx — Agent Performance nav wiring', () => {
  it('has a render branch for the agent_performance tab (Bug Log #1)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/activeTab === 'agent_performance'/);
  });

  it('lazy-imports AgentPerformanceView with the named-export mapping App.tsx requires', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(
      /lazy\(\(\) => import\('\.\/components\/AgentPerformanceView'\)\.then\(\(mod\) => \(\{ default: mod\.AgentPerformanceView \}\)\)\)/
    );
  });
});
