import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScriptStudioTab } from '../../../components/miya/ScriptStudioTab';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

describe('ScriptStudioTab', () => {
  it('shows the research, the script rows, the chosen hook and the review scores', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'research', { output: {
      hector: { references: [{ title: 'Ref post', url: 'https://ref.example', whyItWorks: 'fast', hook: 'Wait.' }], patterns: ['cut every 2 s'], hookIdeas: ['a'] },
      nova: { competitors: [], gaps: [], opportunityScore: 72, angle: 'the science of waiting' },
    }, summary: '', joseCommandId: null });
    saveStepVersion(p.id, 'script', { output: { miya: {
      hooks: ['Hook one', 'Hook two', 'Hook three'], chosenHook: 1, title: 'Why we wait',
      script: [{ startSec: 0, endSec: 5, spoken: 'You wait.', onScreenText: 'WHY?', bRoll: 'clock', music: 'soft' }],
    } }, summary: '', joseCommandId: null });
    saveStepVersion(p.id, 'review', { output: { nova: { hookScore: 8, scriptScore: 6, notes: [], mustFix: ['shorter intro'] }, maria: { pieces: [], honestyIssues: [] } }, summary: '', joseCommandId: null });
    render(<ScriptStudioTab project={getProject(p.id)!} runStep={vi.fn()} approve={vi.fn()} sendBack={vi.fn()} chooseVersion={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Script Studio' })).toBeTruthy();
    expect(screen.getByText('Ref post')).toBeTruthy();
    expect(screen.getByText('the science of waiting')).toBeTruthy();
    expect(screen.getByText('You wait.')).toBeTruthy();
    expect(screen.getByText('WHY?')).toBeTruthy();
    expect(screen.getByText('Hook two').closest('[data-chosen="true"]')).toBeTruthy();
    expect(screen.getByText('Hook one').closest('[data-chosen="true"]')).toBeNull();
    expect(screen.getByText(/Hook 8\/10/)).toBeTruthy();
    expect(screen.getByText('shorter intro')).toBeTruthy();
  });
});
