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

  // 2.11.0 QA (owner, 2026-11-01): a review saved before the answer check tidied lists held
  // objects; the tab crashed Miya Studio (React error 31).
  it('shows a saved review whose list items are objects, without crashing', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'review', { output: {
      nova: { hookScore: 5, scriptScore: 5, notes: [{ note: 'Pacing is fine.' }], mustFix: [{ 'what must change': 'Cut the intro.' }] },
      maria: { pieces: [{ pieceId: 'script', score: 4, weakPoints: [{ 'a weak point': 'Slow hook.' }] }], honestyIssues: [{ 'an honesty problem, if any': 'Uncited study.' }] },
    }, summary: '', joseCommandId: null });
    render(<ScriptStudioTab project={getProject(p.id)!} runStep={vi.fn()} approve={vi.fn()} sendBack={vi.fn()} chooseVersion={vi.fn()} />);
    expect(screen.getByText('Uncited study.')).toBeTruthy();
    expect(screen.getByText('Cut the intro.')).toBeTruthy();
    expect(screen.getByText('Pacing is fine.')).toBeTruthy();
    expect(screen.getByText(/Slow hook\./)).toBeTruthy();
  });
});
