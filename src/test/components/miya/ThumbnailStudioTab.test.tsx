import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, loadProjectImage: vi.fn(async () => 'data:image/png;base64,AAAA') };
});

import { ThumbnailStudioTab } from '../../../components/miya/ThumbnailStudioTab';
import { createProject, emptyBrief, getProject, saveStepVersion, setVersionOutputField } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

function setup() {
  const p = createProject('b', 'P', emptyBrief());
  const concepts = [1, 2, 3].map((n) => ({ id: `t${n}`, headline: `HEADLINE ${n}`, imagePrompt: 'x', layout: 'left' }));
  saveStepVersion(p.id, 'thumbnail', { output: { miya: { concepts } }, summary: '', joseCommandId: null });
  setVersionOutputField(p.id, 'thumbnail', 1, 'pictures', concepts.map((c) => ({ sceneId: c.id, status: 'done', relativePath: `b/p/thumbnail/v1-${c.id}.png`, headline: c.headline })));
  return getProject(p.id)!;
}

describe('ThumbnailStudioTab', () => {
  it('shows the three finished thumbnails with their headlines', async () => {
    render(<ThumbnailStudioTab project={setup()} outputRoot="D:\\Content" runStep={vi.fn()} chooseVersion={vi.fn()} reject={vi.fn()} checkAgain={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Thumbnail Studio' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(screen.getByText('HEADLINE 2')).toBeTruthy();
  });

  it('asks for a reason before rejecting a thumbnail', () => {
    const reject = vi.fn();
    render(<ThumbnailStudioTab project={setup()} outputRoot="D:\\Content" runStep={vi.fn()} chooseVersion={vi.fn()} reject={reject} checkAgain={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    fireEvent.change(screen.getByLabelText('What is wrong with it?'), { target: { value: 'too dark' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject with this reason' }));
    expect(reject).toHaveBeenCalledWith('t1', 'too dark');
  });
});
