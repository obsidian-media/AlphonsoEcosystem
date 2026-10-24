// Phase 3a: Campaign Studio shows the Posts list and exports the ad copy per network.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('../../../services/marcusExecutionService', () => ({ cancelScheduledContentPost: vi.fn(), postOverdueNow: vi.fn(), scheduleContentPost: vi.fn() }));

import { CampaignStudioTab } from '../../../components/miya/CampaignStudioTab';
import { createProject, emptyBrief, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';

function setup() {
  const brand = saveBrand({ name: 'Acme' });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'x' });
  const project = saveStepVersion(p.id, 'campaign', {
    output: { miya: { platforms: [], ads: [{ network: 'Meta', headline: 'Try it', body: 'Free' }, { network: 'Google', headline: 'G', body: 'g' }], calendar: [] } },
    summary: 'c', joseCommandId: null,
  });
  return { brand, project };
}

const props = { runStep: vi.fn(), chooseVersion: vi.fn(), approve: vi.fn(), sendBack: vi.fn() };

beforeEach(() => { localStorage.clear(); invoke.mockReset().mockResolvedValue(undefined); });

describe('CampaignStudioTab', () => {
  it('exports a network\'s ad copy to the project\'s campaign folder', async () => {
    const { brand, project } = setup();
    render(<CampaignStudioTab {...props} project={project} brand={brand} outputRoot="D:\\Content" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export Meta Ads CSV' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('write_workspace_text_file', expect.objectContaining({
      relativePath: `${brand.folderName}/${project.folderName}/campaign/ads-meta-v1.csv`,
    })));
    expect(await screen.findByText(/ads-meta-v1\.csv/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export YouTube Ads CSV' })).toBeNull();
  });

  it('says to choose an output folder before exporting', () => {
    const { brand, project } = setup();
    render(<CampaignStudioTab {...props} project={project} brand={brand} outputRoot="" onChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Export Meta Ads CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('has the Posts list, approved through the Publish step', () => {
    const { brand, project } = setup();
    render(<CampaignStudioTab {...props} project={project} brand={brand} outputRoot="D:\\Content" onChange={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Posts' })).toBeInTheDocument();
  });
});
