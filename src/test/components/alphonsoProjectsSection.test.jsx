// Agent phase 6: Settings → Agents → Alphonso's projects and his code model.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../services/jose/joseModels', async (orig) => ({ ...(await orig()), listInstalledModels: vi.fn(async () => ['llama3.2:3b', 'qwen2.5:7b']) }));

import { AlphonsoProjectsSection } from '../../components/alphonso/AlphonsoProjectsSection';
import { listProjects } from '../../services/alphonso/projects';

beforeEach(() => localStorage.clear());

describe('AlphonsoProjectsSection', () => {
  it('adds and removes a project', async () => {
    render(<AlphonsoProjectsSection settings={{}} setSettings={() => {}} />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'shop' } });
    fireEvent.change(screen.getByLabelText('Project folder'), { target: { value: 'D:\\code\\shop' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add project' })); });
    expect(listProjects()).toEqual([{ name: 'shop', folder: 'D:\\code\\shop' }]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove shop' })); });
    expect(listProjects()).toEqual([]);
  });

  it('the code model lists installed models after "Same as Alphonso"', async () => {
    const setSettings = vi.fn();
    render(<AlphonsoProjectsSection settings={{}} setSettings={setSettings} />);
    const select = await screen.findByLabelText("Model for Alphonso's code");
    await screen.findByRole('option', { name: 'qwen2.5:7b' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Same as Alphonso', 'llama3.2:3b', 'qwen2.5:7b']);
    fireEvent.change(select, { target: { value: 'qwen2.5:7b' } });
    expect(setSettings).toHaveBeenCalledWith({ alphonsoCodeModel: 'qwen2.5:7b' });
  });
});
