// The Skills page (agent roles Part B, 2026-10-25).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const files = new Map<string, string>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any = {}) => {
    if (cmd === 'skills_list_user') return [...files].map(([key, text]) => { const [agent, file] = key.split('/'); return { agent, file, text, tooLarge: false }; });
    if (cmd === 'skills_save_user') { files.set(`${args.agent}/${args.file}`, args.text); return null; }
    if (cmd === 'skills_delete_user') { files.delete(`${args.agent}/${args.file}`); return null; }
    return null;
  }),
}));

import { SkillsPage } from '../../../components/skills/SkillsPage';
import { setUserSkillFiles } from '../../../services/skills/skillLibrary';

beforeEach(() => { files.clear(); setUserSkillFiles([]); localStorage.clear(); });

describe('SkillsPage', () => {
  it("lists each agent's skills", () => {
    render(<SkillsPage />);
    const hector = screen.getByTestId('skills-agent-hector');
    expect(within(hector).getByText('Web research with sources')).toBeTruthy();
    expect(within(screen.getByTestId('skills-agent-maria')).getByText('Claim check')).toBeTruthy();
    expect(screen.queryByTestId('skills-agent-jose')).toBeNull();
  });

  it('New skill saves a valid skill', async () => {
    render(<SkillsPage />);
    fireEvent.click(within(screen.getByTestId('skills-agent-alphonso')).getByText('New skill'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Short answers' } });
    fireEvent.change(screen.getByLabelText('Use when'), { target: { value: 'Someone wants a one-line answer.' } });
    fireEvent.click(screen.getByLabelText('assistant_answer'));
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'Answer in one line.' } });
    fireEvent.click(screen.getByText('Save skill'));
    await waitFor(() => expect(files.has('alphonso/short-answers.md')).toBe(true));
    await waitFor(() => expect(within(screen.getByTestId('skills-agent-alphonso')).getByText('Short answers')).toBeTruthy());
  });

  it("the form shows the check's reasons and saves nothing", async () => {
    render(<SkillsPage />);
    fireEvent.click(within(screen.getByTestId('skills-agent-alphonso')).getByText('New skill'));
    fireEvent.click(screen.getByText('Save skill'));
    await waitFor(() => expect(screen.getByTestId('skill-form-problems').textContent).toContain('The skill has no name.'));
    expect(files.size).toBe(0);
  });

  // Agent roles Part C1: each skill's results.
  it("shows each skill's results", async () => {
    const { recordStepOutcome, recordReviewVerdict } = await import('../../../services/skills/skillOutcomes');
    recordStepOutcome({ requestId: 'r', stepId: 'a', agent: 'hector', skill: 'Web research with sources', actionType: 'research_report', model: null, outcome: 'done' });
    recordReviewVerdict('r', 'a', 'pass');
    render(<SkillsPage />);
    const row = screen.getAllByTestId('skill-row').find((r) => r.textContent?.includes('Web research with sources'))!;
    expect(row.textContent).toContain('Used once · 1 of 1 reviews passed · last used today');
  });

  it('refused files are listed with their reasons', () => {
    setUserSkillFiles([{ agent: 'maria', file: 'snoop.md', text: '---\nname: Snoop\nagent: maria\nuse_when: x\ntask_types: [research_report]\n---\nResearch.' }]);
    render(<SkillsPage />);
    expect(screen.getByTestId('skills-refused').textContent).toContain("maria/snoop.md: research_report is Hector's work, not Maria's.");
  });

  it('your skill shows Delete; a built-in one does not', async () => {
    setUserSkillFiles([{ agent: 'nova', file: 'quick.md', text: '---\nname: Quick judgement\nagent: nova\nuse_when: x\ntask_types: [analysis_findings]\n---\nJudge fast.' }]);
    files.set('nova/quick.md', 'x');
    render(<SkillsPage />);
    const nova = screen.getByTestId('skills-agent-nova');
    const row = within(nova).getByText('Quick judgement').closest('[data-testid="skill-row"]') as HTMLElement;
    expect(within(row).getByText('Yours')).toBeTruthy();
    fireEvent.click(within(row).getByText('Delete'));
    await waitFor(() => expect(files.has('nova/quick.md')).toBe(false));
    const builtIn = within(nova).getByText('Value and priority').closest('[data-testid="skill-row"]') as HTMLElement;
    expect(within(builtIn).queryByText('Delete')).toBeNull();
  });
});
