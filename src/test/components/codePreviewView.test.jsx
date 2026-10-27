// Agent phase 6: what Alphonso's prepared change shows before you approve it.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Agent roles Part C2: you can edit a file of the change before approving it.
describe('CodePreviewView: editing', () => {
  it('Edit opens the file, Save hands your text over, and an edited file says so', () => {
    const onEdit = vi.fn(() => ({ ok: true }));
    const { rerender } = render(<CodePreviewView preview={preview} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('alphonso-edit-src/App.tsx'));
    const box = screen.getByLabelText('Edit src/App.tsx');
    expect(box.value).toBe('one\nTWO');
    fireEvent.change(box, { target: { value: 'one\nThree' } });
    fireEvent.click(screen.getByTestId('alphonso-edit-save'));
    expect(onEdit).toHaveBeenCalledWith('src/App.tsx', 'one\nThree');
    const edited = { ...preview, edited: true, files: [{ ...preview.files[0], editedByYou: true }, preview.files[1]] };
    rerender(<CodePreviewView preview={edited} onEdit={onEdit} />);
    expect(screen.getByTestId('alphonso-code-preview').textContent).toContain('Edited by you');
  });

  it('Cancel closes it without saving; with no onEdit there is no Edit', () => {
    const onEdit = vi.fn(() => ({ ok: true }));
    const { rerender } = render(<CodePreviewView preview={preview} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('alphonso-edit-src/App.tsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onEdit).not.toHaveBeenCalled();
    rerender(<CodePreviewView preview={preview} />);
    expect(screen.queryByTestId('alphonso-edit-src/App.tsx')).toBeNull();
  });

  it("shows why a save didn't work", () => {
    render(<CodePreviewView preview={preview} onEdit={() => ({ ok: false, reason: 'This change has already been approved or rejected.' })} />);
    fireEvent.click(screen.getByTestId('alphonso-edit-src/App.tsx'));
    fireEvent.click(screen.getByTestId('alphonso-edit-save'));
    expect(screen.getByTestId('alphonso-code-preview').textContent).toContain('This change has already been approved or rejected.');
  });
});
