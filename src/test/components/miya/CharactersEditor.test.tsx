// Phase 4c: the Brands tab's Characters section.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, loadProjectImage: vi.fn(async () => 'data:image/png;base64,AAA') };
});
vi.mock('../../../services/contentFactory/contentCharacters', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentCharacters')>('../../../services/contentFactory/contentCharacters');
  return { ...actual, makeCharacterPictures: vi.fn(async () => ({ made: 8, failed: 0 })) };
});

vi.mock('../../../services/contentFactory/contentCharacterTraining', () => ({
  trainCharacter: vi.fn(async () => ({ ok: true, requestId: 'jose-request-1' })),
  checkCharacterTraining: vi.fn(async () => null),
}));

import { CharactersEditor } from '../../../components/miya/CharactersEditor';
import { trainCharacter, checkCharacterTraining } from '../../../services/contentFactory/contentCharacterTraining';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { addCharacter, makeCharacterPictures, updateCharacter } from '../../../services/contentFactory/contentCharacters';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  vi.clearAllMocks();
});

describe('CharactersEditor', () => {
  it('adds a real person, who needs the permission tick, saved with its date', () => {
    const brand = saveBrand({ name: 'Me' });
    render(<CharactersEditor brandId={brand.id} />);
    fireEvent.change(screen.getByLabelText('New character name'), { target: { value: 'Shay' } });
    fireEvent.change(screen.getByLabelText('New character kind'), { target: { value: 'real_person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add character' }));
    expect(screen.getByText('Tick that this is you or that you have permission first.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make pictures with Miya' })).toBeNull();
    fireEvent.click(screen.getByLabelText("This is me, or I have this person's permission"));
    const c = getBrand(brand.id)!.characters![0];
    expect(c).toMatchObject({ name: 'Shay', kind: 'real_person' });
    expect(typeof c.permission?.atMs).toBe('number');
    expect(screen.getByText('Add at least 5 pictures.')).toBeTruthy();
  });

  it('makes pictures with Miya for a made-up character, and picks the main character', async () => {
    const brand = saveBrand({ name: 'Learn' });
    addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'a teacher' });
    const b = addCharacter(brand.id, { name: 'Bo', kind: 'made_up', description: 'a robot' });
    render(<CharactersEditor brandId={brand.id} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Make pictures with Miya' })[0]);
    await waitFor(() => expect(makeCharacterPictures).toHaveBeenCalledWith(brand.id, expect.any(String), { outputFolder: 'D:\\Content' }));
    expect(await screen.findByText('Miya made 8 pictures.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Main character: Bo'));
    expect(getBrand(brand.id)!.mainCharacterId).toBe(b.id);
  });

  it('trains on Higgsfield once usable, and checks a training still running', async () => {
    const brand = saveBrand({ name: 'Learn' });
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'a teacher' });
    const { rerender } = render(<CharactersEditor brandId={brand.id} />);
    expect((screen.getByRole('button', { name: 'Train on Higgsfield' }) as HTMLButtonElement).disabled).toBe(true);
    updateCharacter(brand.id, c.id, { pictures: ['a', 'b', 'c', 'd', 'e'] });
    rerender(<CharactersEditor brandId={brand.id} key="2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Train on Higgsfield' }));
    await waitFor(() => expect(trainCharacter).toHaveBeenCalledWith(brand.id, c.id, { outputFolder: 'D:\\Content' }));
    expect(await screen.findByText('Training asks first with its cost (see the Requests board or Telegram).')).toBeTruthy();
    updateCharacter(brand.id, c.id, { higgsfield: { status: 'training', requestId: 'r' } });
    rerender(<CharactersEditor brandId={brand.id} key="3" />);
    expect(screen.getByText('Training on Higgsfield…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(checkCharacterTraining).toHaveBeenCalledWith(brand.id, c.id));
  });
});
