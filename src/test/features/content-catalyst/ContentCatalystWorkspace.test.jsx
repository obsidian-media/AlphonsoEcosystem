import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/approval/approvalService', () => ({ requireApproval: vi.fn() }));
vi.mock('../../../services/agentWorkshop/accBridgeService', () => ({
  getAccBridgeConfig: vi.fn(() => ({})),
  getAccBridgeStatus: vi.fn(() => ({ configured: false })),
  listAccBridgePackets: vi.fn(() => []),
  resetAccBridgeConfig: vi.fn(),
  refreshAccBridgeStatus: vi.fn(async () => ({ configured: false })),
  syncContentCatalystJob: vi.fn(),
  updateAccBridgeConfig: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/services/contentCatalystService', () => ({
  createContentBridgeRequest: vi.fn((r) => r),
  createContentBridgeResponse: vi.fn(() => null),
  generateContentDraft: vi.fn(),
  generateContentImage: vi.fn(),
  generateContentNarration: vi.fn(),
  generateContentPreview: vi.fn(),
  generateContentVideo: vi.fn(),
  listContentJobs: vi.fn(() => []),
  publishContent: vi.fn(),
  publishContentPreview: vi.fn(),
  runContentCatalystJob: vi.fn(),
  upsertContentJob: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/state/contentCatalystState', () => ({
  assignDraftSchedule: vi.fn(),
  getBrandProfile: vi.fn(() => ({})),
  getContentAnalyticsSnapshot: vi.fn(() => ({ total: 0, ready: 0, published: 0 })),
  getTrendResearchSuggestions: vi.fn(() => []),
  listDraftHistory: vi.fn(() => []),
  saveBrandProfile: vi.fn(),
}));
vi.mock('../../../features/content-catalyst/services/contentPersistenceService', () => ({
  hydrateContentJobsFromSqlite: vi.fn(async () => []),
  persistContentJobsToSqlite: vi.fn(async () => {}),
}));
vi.mock('../../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(async () => []),
  startTool: vi.fn(),
  waitForTool: vi.fn(),
}));

import { ContentCatalystWorkspace } from '../../../features/content-catalyst/components/ContentCatalystWorkspace';

describe('ContentCatalystWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Content Studio header and all 5 tabs, defaulting to Create', () => {
    render(<ContentCatalystWorkspace settings={{}} />);
    expect(screen.getByText('Content Studio')).toBeTruthy();
    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText('Brand')).toBeTruthy();
  });

  it('switches to the Analytics tab', async () => {
    render(<ContentCatalystWorkspace settings={{}} />);
    fireEvent.click(screen.getByText('Analytics'));
    expect(await screen.findByText('Total')).toBeTruthy();
  });
});
