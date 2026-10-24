// Phase 3c: Settings → Connectors → Your storage.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const saved: Record<string, string> = {};
const saveConnectorCredential = vi.fn((_id: string, key: string, value: string) => { saved[key] = value; });
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_id: string, key: string) => saved[key] || '',
  saveConnectorCredential: (...a: [string, string, string]) => saveConnectorCredential(...a),
}));
const testStorage = vi.fn();
vi.mock('../../services/mediaStorageService', async (orig) => ({
  ...(await orig<typeof import('../../services/mediaStorageService')>()),
  testStorage: () => testStorage(),
}));

import { MediaStorageSection } from '../../components/MediaStorageSection';

beforeEach(() => {
  for (const k of Object.keys(saved)) delete saved[k];
  saveConnectorCredential.mockClear();
  testStorage.mockReset();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('MediaStorageSection', () => {
  it('saves every field under the storage connector', () => {
    render(<MediaStorageSection />);
    type('Storage address', 'https://abc.r2.cloudflarestorage.com');
    type('Region', 'auto');
    type('Bucket', 'media');
    type('Access key', 'ak');
    type('Secret key', 'sk');
    fireEvent.click(screen.getByLabelText(/address includes the bucket/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save storage' }));
    expect(saved).toEqual({
      STORAGE_ENDPOINT: 'https://abc.r2.cloudflarestorage.com', STORAGE_REGION: 'auto', STORAGE_BUCKET: 'media',
      STORAGE_ACCESS_KEY: 'ak', STORAGE_SECRET_KEY: 'sk', STORAGE_PATH_STYLE: 'true',
    });
    expect(saveConnectorCredential).toHaveBeenCalledWith('media_storage', 'STORAGE_BUCKET', 'media');
    expect(screen.getByRole('status')).toHaveTextContent('Storage saved.');
  });

  it('says what is missing instead of saving half', () => {
    render(<MediaStorageSection />);
    type('Bucket', 'media');
    fireEvent.click(screen.getByRole('button', { name: 'Save storage' }));
    expect(saveConnectorCredential).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Fill in the address, bucket, access key and secret key.');
  });

  it("Test shows each part's result", async () => {
    testStorage.mockResolvedValue({ upload: { ok: true }, link: { ok: false, reason: 'The link did not open the file (403).' }, delete: { ok: true } });
    render(<MediaStorageSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText('Upload: worked')).toBeInTheDocument());
    expect(screen.getByText('Link: The link did not open the file (403).')).toBeInTheDocument();
    expect(screen.getByText('Delete: worked')).toBeInTheDocument();
  });

  it('explains that storage is optional and stays private', () => {
    render(<MediaStorageSection />);
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
    expect(screen.getByText(/stays private/)).toBeInTheDocument();
  });
});
