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

import { CharactersEditor } from '../../../components/miya/CharactersEditor';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import { addCharacter, makeCharacterPictures } from '../../../services/contentFactory/contentCharacters';

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
});
