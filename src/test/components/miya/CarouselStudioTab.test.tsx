// Phase 3c: Carousel Studio, next to Thumbnail Studio.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, loadProjectImage: vi.fn(async () => 'data:image/png;base64,AAAA') };
});

import { CarouselStudioTab } from '../../../components/miya/CarouselStudioTab';
import { createProject, emptyBrief, getProject, reorderSlides, saveStepVersion, setVersionOutputField } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

function setup() {
  const p = createProject('b', 'P', emptyBrief());
  const slides = [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, cover: n === 1, headline: `HEADLINE ${n}`, body: `Body ${n}`, imagePrompt: 'x' }));
  saveStepVersion(p.id, 'carousel', { output: { miya: { slides } }, summary: '', joseCommandId: null });
  setVersionOutputField(p.id, 'carousel', 1, 'pictures', slides.map((s) => ({ sceneId: s.id, status: 'done', relativePath: `b/p/carousel/v1-${s.id}.png` })));
  return getProject(p.id)!;
}
const props = () => ({ outputRoot: 'D:/Content', runStep: vi.fn(), chooseVersion: vi.fn(), redo: vi.fn(), move: vi.fn(), reject: vi.fn(), checkAgain: vi.fn() });

describe('CarouselStudioTab', () => {
  it("shows each slide's picture, headline and text", async () => {
    render(<CarouselStudioTab project={setup()} {...props()} />);
    expect(screen.getByRole('heading', { name: 'Carousel Studio' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(5));
    expect(screen.getByText('HEADLINE 3')).toBeTruthy();
    expect(screen.getByText('Body 3')).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
  });

  it('Redo makes that slide again only', () => {
    const p = props();
    render(<CarouselStudioTab project={setup()} {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Redo slide 2' }));
    expect(p.redo).toHaveBeenCalledWith(1);
  });

  it('Move left/right reorders', () => {
    const p = props();
    render(<CarouselStudioTab project={setup()} {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move slide 3 left' }));
    expect(p.move).toHaveBeenCalledWith(2, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Move slide 3 right' }));
    expect(p.move).toHaveBeenCalledWith(2, 3);
    expect((screen.getByRole('button', { name: 'Move slide 1 left' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Send back with a reason', () => {
    const p = props();
    render(<CarouselStudioTab project={setup()} {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send back slide 4' }));
    fireEvent.change(screen.getByLabelText('What is wrong with it?'), { target: { value: 'Too wordy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send back with this reason' }));
    expect(p.reject).toHaveBeenCalledWith('c4', 'Too wordy');
  });

  it('with no carousel yet, says how to make one', () => {
    const project = createProject('b', 'P', emptyBrief());
    render(<CarouselStudioTab project={project} {...props()} />);
    expect(screen.getByText(/add “carousel” to What to make/i)).toBeTruthy();
  });
});

it('reorderSlides moves a slide and its picture, and keeps the cover first', () => {
  const project = setup();
  reorderSlides(project.id, 0, 2);
  const out = getProject(project.id)!.steps.carousel.versions[0].output as { miya: { slides: { id: string; cover: boolean }[] }; pictures: { sceneId: string }[] };
  expect(out.miya.slides.map((s) => s.id)).toEqual(['c2', 'c3', 'c1', 'c4', 'c5']);
  expect(out.pictures.map((p) => p.sceneId)).toEqual(['c2', 'c3', 'c1', 'c4', 'c5']);
  expect(out.miya.slides.map((s) => s.cover)).toEqual([true, false, false, false, false]);
  expect(getProject(project.id)!.steps.carousel.versions).toHaveLength(1);
});
