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
vi.mock('../../../services/contentFactory/contentImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/contentFactory/contentImages')>()),
  renderCarouselSlides: vi.fn(async () => []),
}));
vi.mock('../../../services/contentFactory/shortMaker', () => ({ redoShort: vi.fn(async () => ({ shortId: 'sh1', status: 'done' })) }));
vi.mock('../../../services/jose/joseRequestStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/jose/joseRequestStore')>()),
  getJoseRequest: vi.fn(() => (globalThis as any).__request || null),
}));

import { ContentFactoryPanel, selectContentProject } from '../../../components/miya/ContentFactoryPanel';
import { runContentProject, approveContentStep } from '../../../services/contentFactory/contentStepRunner';
import { renderCarouselSlides } from '../../../services/contentFactory/contentImages';
import { redoShort } from '../../../services/contentFactory/shortMaker';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, markStepStatus, saveStepVersion, setProjectRequest } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';

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

// Phase 3c: Carousel Studio.
it('the Carousel tab shows Carousel Studio, and Redo makes only that slide again', async () => {
  const { project } = setup();
  const slides = [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, cover: n === 1, headline: `H${n}`, body: `B${n}`, imagePrompt: 'x' }));
  saveStepVersion(project.id, 'carousel', { output: { miya: { slides } }, summary: '', joseCommandId: null });
  render(<ContentFactoryPanel tab="carousel" settings={settings} />);
  expect(screen.getByRole('heading', { name: 'Carousel Studio' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Redo slide 3' }));
  await waitFor(() => expect(renderCarouselSlides).toHaveBeenCalledWith(project.id, settings, undefined, 2));
});

// Phase 3d: Shorts Studio.
it('the Shorts tab shows Shorts Studio, and Redo makes that Short again', async () => {
  const { project } = setup();
  saveStepVersion(project.id, 'shorts', { output: { miya: { shorts: [{ id: 'sh1', kind: 'cut', title: 'S', hook: 'h', seconds: 30, platforms: ['youtube'], copy: [], moment: { startSec: 0, endSec: 30 } }] } }, summary: '', joseCommandId: null });
  render(<ContentFactoryPanel tab="shorts" settings={settings} />);
  expect(screen.getByRole('heading', { name: 'Shorts Studio' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Redo Short 1' }));
  await waitFor(() => expect(redoShort).toHaveBeenCalledWith(project.id, 'sh1', settings));
});

// Jose phase 7 (found by CI): Publish runs in the background after Approve and schedule; the
// Posts list has to keep refreshing until the approved post has gone out or been handed on.
describe('ContentFactoryPanel while approved posts go out', () => {
  it('shows the new status of a post without a reload', async () => {
    const { project } = setup();
    const post = { id: 'p1', platform: 'instagram', piece: 'reel', status: 'approved', caption: 'Slow coffee', hashtags: [], scheduledAtMs: Date.now() - 1000 } as never;
    savePosts(project.id, [post]);
    render(<ContentFactoryPanel tab="campaign" settings={settings} />);
    savePosts(project.id, [{ ...(post as object), status: 'by_hand', folder: 'x' } as never]);
    expect(await screen.findByText(/Post by hand/, undefined, { timeout: 4000 })).toBeTruthy();
  });
});
