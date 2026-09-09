import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('App.tsx — global memory search (lifted from ChatView)', () => {
  it('App.tsx owns a showMemorySearch state and renders MemorySearch globally', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/showMemorySearch/);
    expect(source).toMatch(/<MemorySearch/);
  });

  it('App.tsx calls useKeyboardShortcuts with a toggle_search handler', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
    expect(source).toMatch(/toggle_search:/);
  });

  it('ChatView.tsx no longer owns showMemorySearch or a toggle_search binding', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/ChatView.tsx'), 'utf-8');
    expect(source).not.toMatch(/showMemorySearch/);
    expect(source).not.toMatch(/toggle_search:/);
  });

  it('ChatView.tsx still keeps its other 4 shortcut bindings unchanged', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/ChatView.tsx'), 'utf-8');
    expect(source).toMatch(/new_chat:/);
    expect(source).toMatch(/focus_input:/);
    expect(source).toMatch(/abort_generation:/);
    expect(source).toMatch(/show_shortcuts:/);
  });
});
