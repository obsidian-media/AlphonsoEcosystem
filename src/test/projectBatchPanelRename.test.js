import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ProjectBatchPanel rename (resolves Boardroom naming collision)', () => {
  it('the renamed file exists and exports ProjectBatchPanel as its default export', () => {
    const filePath = path.resolve(__dirname, '../components/ProjectBatchPanel.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/export default function ProjectBatchPanel\(\)/);
  });

  it('the old BoardroomPanel.tsx no longer exists', () => {
    const oldPath = path.resolve(__dirname, '../components/BoardroomPanel.tsx');
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('OperatorDashboard.tsx imports the renamed component, not the old name', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/OperatorDashboard.tsx'), 'utf-8');
    expect(source).not.toMatch(/BoardroomPanel/);
    expect(source).toMatch(/ProjectBatchPanel/);
  });
});
