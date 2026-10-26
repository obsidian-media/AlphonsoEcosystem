// Agent phase 6: what Alphonso's prepared change shows before you approve it.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodePreviewView } from '../../components/alphonso/CodePreviewView';
import { classifyCommand, classifyFile } from '../../services/alphonso/changeSet';

const preview = {
  place: { kind: 'project', name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' },
  plan: 'Add a dark mode toggle.', title: 'Dark mode',
  files: [classifyFile('src/App.tsx', 'one\nTWO', 'one\ntwo'), classifyFile('src/toggle.ts', 'export {}', null)],
  commands: [classifyCommand('npm', ['run', 'test'], 'checks it'), classifyCommand('git', ['status'], 'see what changed')],
  dropped: [{ path: '../x.js', reason: 'Outside the project folder.' }],
  model: 'qwen2.5:7b', preparedAtMs: 1,
};

describe('CodePreviewView', () => {
  it('shows the plan, each file with its change, the commands and the model', () => {
    render(<CodePreviewView preview={preview} />);
    const view = screen.getByTestId('alphonso-code-preview');
    expect(view.textContent).toContain('Add a dark mode toggle.');
    expect(view.textContent).toContain('src/App.tsx');
    expect(view.textContent).toContain('changed');
    expect(view.textContent).toContain('+1 −1');
    expect(view.textContent).toContain('- two');
    expect(view.textContent).toContain('+ TWO');
    expect(view.textContent).toContain('src/toggle.ts');
    expect(view.textContent).toContain('new');
    expect(view.textContent).toContain('npm run test');
    expect(view.textContent).toContain('checks it');
    expect(view.textContent).toContain('git status');
    expect(view.textContent).toContain('runs without asking');
    expect(view.textContent).toContain('../x.js: Outside the project folder.');
    expect(view.textContent).toContain('Model: qwen2.5:7b');
    expect(view.textContent).toContain('In shop');
  });

  it("says Alphonso's own model when no code model was set", () => {
    render(<CodePreviewView preview={{ ...preview, model: '' }} />);
    expect(screen.getByTestId('alphonso-code-preview').textContent).toContain("Model: Alphonso's own");
  });
});
