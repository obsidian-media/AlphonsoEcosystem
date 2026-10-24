// Phase 3a: a brand's fixed posting times, edited in the Brands tab.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../../services/connectors/elevenLabsConnector', () => ({
  listElevenLabsVoices: vi.fn(async () => ({ ok: true, voices: [{ id: 'v1', name: 'Rachel', cloned: false }, { id: 'v2', name: 'My voice', cloned: true }] })),
  listElevenLabsModels: vi.fn(async () => ({ ok: true, models: [{ id: 'eleven_multilingual_v2', name: 'Multilingual v2' }] })),
}));
import { BrandEditor } from '../../../components/miya/BrandEditor';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';

beforeEach(() => localStorage.clear());

describe('BrandEditor posting times', () => {
  it('adds, edits and removes posting times, and saves them with the brand', () => {
    const brand = saveBrand({ name: 'Acme' });
    render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a posting time' }));
    fireEvent.change(screen.getByLabelText('Posting time 1 platform'), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText('Posting time 1 day'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Posting time 1 time'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a posting time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove posting time 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save brand' }));
    expect(getBrand(brand.id)!.postingSlots).toEqual([{ platform: 'instagram', day: 3, time: '19:30' }]);
  });

  it('shows the times a brand already has', () => {
    const brand = saveBrand({ name: 'Acme', postingSlots: [{ platform: 'youtube', day: 2, time: '17:00' }] });
    render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
    expect((screen.getByLabelText('Posting time 1 platform') as HTMLSelectElement).value).toBe('youtube');
    expect((screen.getByLabelText('Posting time 1 day') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Posting time 1 time') as HTMLInputElement).value).toBe('17:00');
  });
});

// Phase 3c: each brand chooses its carousel shape.
it('saves the carousel shape, 4:5 by default', () => {
  const brand = saveBrand({ name: 'Acme' });
  render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
  const shape = screen.getByLabelText('Carousel shape') as HTMLSelectElement;
  expect(shape.value).toBe('4:5');
  fireEvent.change(shape, { target: { value: '1:1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save brand' }));
  expect(getBrand(brand.id)!.carouselShape).toBe('1:1');
});

// Phase 4a: the brand's results.
it("shows the brand's results", () => {
  const brand = saveBrand({ name: 'Acme' });
  render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
  expect(screen.getByRole('region', { name: 'Results' })).toBeTruthy();
});

it('lists only kept lessons as lessons', () => {
  const brand = saveBrand({ name: 'Acme', lessons: [
    { id: 'l1', atMs: 1, text: 'WAITING-LESSON', source: 'performance', status: 'proposed', kind: 'worked' },
    { atMs: 2, text: 'An older lesson', source: 'rejection' },
  ] } as any);
  render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
  const lessons = screen.getByText('Lessons from your feedback').parentElement!;
  expect(lessons.textContent).toContain('An older lesson');
  expect(lessons.textContent).not.toContain('WAITING-LESSON');
});

// Phase 4b: a brand's voice, pictures and AI clips engines.
it("the brand's voice can be one of your ElevenLabs voices, and pictures and clips can be Higgsfield", async () => {
  const brand = saveBrand({ name: 'Acme' });
  render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
  fireEvent.change(screen.getByLabelText('Voice engine'), { target: { value: 'elevenlabs' } });
  await waitFor(() => expect(screen.getByRole('option', { name: 'My voice (your clone)' })).toBeTruthy());
  fireEvent.change(screen.getByLabelText('ElevenLabs voice'), { target: { value: 'v2' } });
  fireEvent.change(screen.getByLabelText('ElevenLabs model'), { target: { value: 'eleven_multilingual_v2' } });
  fireEvent.change(screen.getByLabelText('Pictures made by'), { target: { value: 'higgsfield' } });
  fireEvent.change(screen.getByLabelText('AI clips made by'), { target: { value: 'higgsfield' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save brand' }));
  expect(getBrand(brand.id)!.engines).toEqual({
    voice: { engine: 'elevenlabs', voiceId: 'v2', modelId: 'eleven_multilingual_v2' }, pictures: 'higgsfield', clips: 'higgsfield',
  });
});

