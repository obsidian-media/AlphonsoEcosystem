import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentStepRunner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/contentFactory/contentStepRunner')>()),
  runContentStep: vi.fn(async () => undefined),
  runContentProject: vi.fn(async () => ({ ok: true, requestId: 'jose-request-c1' })),
  approveContentStep: vi.fn(async () => undefined),
}));
vi.mock('../../../services/contentFactory/contentMediaExecutor', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  resolveProjectClipEngine: vi.fn(async () => ({ engine: 'local', modelId: 'ltx_video_2b', maxSeconds: 5 })),
}));
vi.mock('../../../services/jose/joseRequestStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/jose/joseRequestStore')>()),
  getJoseRequest: vi.fn(() => (globalThis as any).__request || null),
}));

import { ContentFactoryPanel, selectContentProject } from '../../../components/miya/ContentFactoryPanel';
import { runContentProject, approveContentStep } from '../../../services/contentFactory/contentStepRunner';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, markStepStatus, saveStepVersion, setProjectRequest } from '../../../services/contentFactory/contentProjectService';

const settings = { outputFolder: 'D:\\Content' };

function setup() {
  const brand = saveBrand({ name: 'My brand' });
  const project = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
  selectContentProject(brand.id, project.id);
  return { brand, project };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  (globalThis as any).__request = undefined;
});

// Phase 6b: a project runs as one Jose request, shown in Miya Studio.
describe('ContentFactoryPanel and the project request', () => {
  it('Run project runs the whole project', async () => {
    const { project } = setup();
    render(<ContentFactoryPanel tab="script" settings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run project' }));
    await waitFor(() => expect(runContentProject).toHaveBeenCalledWith(project.id, expect.objectContaining({ settings })));
  });

  it('says why Run project could not start', async () => {
    setup();
    vi.mocked(runContentProject).mockResolvedValueOnce({ ok: false, requestId: null, reason: 'Write the idea in the brief first.' });
    render(<ContentFactoryPanel tab="script" settings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run project' }));
    expect(await screen.findByText('Write the idea in the brief first.')).toBeTruthy();
  });

  it("shows the project's request and opens it on the board", () => {
    const { project } = setup();
    setProjectRequest(project.id, 'jose-request-c1');
    (globalThis as any).__request = { id: 'jose-request-c1', status: 'waiting_approval', steps: [] };
    const onOpenJoseBoard = vi.fn();
    render(<ContentFactoryPanel tab="script" settings={settings} onOpenJoseBoard={onOpenJoseBoard} />);
    expect(screen.getByTestId('content-project-request').textContent).toContain('Waiting for your approval');
    fireEvent.click(screen.getByRole('button', { name: 'Open on the board' }));
    expect(onOpenJoseBoard).toHaveBeenCalledWith('jose-request-c1');
  });

  it('Approve goes through the request', async () => {
    const { project } = setup();
    saveStepVersion(project.id, 'review', { output: { nova: {}, maria: {} }, summary: 's', joseCommandId: null });
    markStepStatus(project.id, 'review', 'needs_approval', null);
    render(<ContentFactoryPanel tab="script" settings={settings} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() => expect(approveContentStep).toHaveBeenCalledWith(project.id, 'review', expect.objectContaining({ outputFolder: expect.any(String) })));
  });
});

// Phase 2b: the run stops at AI clips until you check the main moments.
describe('ContentFactoryPanel: AI clips', () => {
  it('"Make AI clips" shows while the run waits at AI clips, and carries it on', async () => {
    const { project } = setup();
    setProjectRequest(project.id, 'jose-request-c1');
    (globalThis as any).__request = { id: 'jose-request-c1', status: 'waiting_approval', steps: [{ stepId: 'clips', status: 'waiting_approval', waitFor: 'Check the main moments in Miya Studio first.' }] };
    render(<ContentFactoryPanel tab="scene" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Make AI clips' }));
    expect(approveContentStep).toHaveBeenCalledWith(project.id, 'clips', expect.objectContaining({ outputFolder: expect.any(String) }));
  });
});
