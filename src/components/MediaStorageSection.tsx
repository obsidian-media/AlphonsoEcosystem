import React, { useState } from 'react';
import { Button } from './ui';
import { getConnectorCredential, saveConnectorCredential } from '../services/connectors/connectorAuth';
import { STORAGE_CONNECTOR, testStorage, type StorageTestResult } from '../services/mediaStorageService';

const FIELDS = [
  { key: 'STORAGE_ENDPOINT', label: 'Storage address', placeholder: 'e.g. https://<account>.r2.cloudflarestorage.com', secret: false },
  { key: 'STORAGE_REGION', label: 'Region', placeholder: 'auto (R2), us-east-1 (S3)…', secret: false },
  { key: 'STORAGE_BUCKET', label: 'Bucket', placeholder: 'The bucket name', secret: false },
  { key: 'STORAGE_ACCESS_KEY', label: 'Access key', placeholder: 'Access key ID', secret: true },
  { key: 'STORAGE_SECRET_KEY', label: 'Secret key', placeholder: 'Secret access key', secret: true },
] as const;
const REQUIRED = ['STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'];

const stored = (key: string) => String(getConnectorCredential(STORAGE_CONNECTOR, key) || '');

/**
 * Settings → Connectors → Your storage (content factory phase 3c). Optional: only
 * Instagram carousels, and Reels sent through Instagram Login, need it. Any
 * S3-compatible bucket; it stays private (links work for an hour, files are deleted).
 */
export function MediaStorageSection(): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, stored(f.key)])));
  const [pathStyle, setPathStyle] = useState(() => stored('STORAGE_PATH_STYLE').toLowerCase() === 'true');
  const [notice, setNotice] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<StorageTestResult | null>(null);

  const save = () => {
    const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]));
    if (REQUIRED.some((k) => !trimmed[k])) {
      setNotice('Fill in the address, bucket, access key and secret key.');
      return;
    }
    for (const f of FIELDS) saveConnectorCredential(STORAGE_CONNECTOR, f.key, trimmed[f.key] || '');
    saveConnectorCredential(STORAGE_CONNECTOR, 'STORAGE_PATH_STYLE', pathStyle ? 'true' : 'false');
    setNotice('Storage saved.');
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testStorage());
    } catch {
      setNotice('The test could not run.');
    } finally {
      setTesting(false);
    }
  };

  const field = 'w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-[12px] text-(--text-1)';
  return (
    <div className="space-y-2 rounded-xl border border-emerald-300/20 bg-emerald-500/8 p-3" data-testid="media-storage-section">
      <h4 className="text-[13px] font-semibold text-emerald-400">Your storage</h4>
      <p className="text-[11px] text-(--text-3)">
        Optional. Instagram takes carousels (and Reels sent through Instagram Login) only by a link, so Alphonso puts the file
        in your own bucket for a moment. Any S3-compatible storage works: Cloudflare R2, Amazon S3, Supabase Storage,
        Backblaze B2 or Wasabi. The bucket stays private: Instagram gets a link that works for an hour, and the file is
        deleted once it is posted. Without storage, those posts are saved ready to post by hand.
      </p>
      {FIELDS.map((f) => (
        <label key={f.key} className="block text-[11px] text-(--text-2)">
          {f.label}
          <input
            aria-label={f.label}
            className={field}
            type={f.secret ? 'password' : 'text'}
            placeholder={f.placeholder}
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <label className="flex items-center gap-2 text-[11px] text-(--text-2)">
        <input type="checkbox" checked={pathStyle} onChange={(e) => setPathStyle(e.target.checked)} />
        The address includes the bucket in its path (R2 account addresses, Supabase, MinIO)
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>Save storage</Button>
        <Button size="sm" variant="ghost" disabled={testing} onClick={test}>{testing ? 'Testing…' : 'Test'}</Button>
      </div>
      {notice && <p role="status" className="text-[11px] text-(--text-2)">{notice}</p>}
      {result && (
        <ul className="text-[11px] text-(--text-2)">
          {(['upload', 'link', 'delete'] as const).map((part) => (
            <li key={part}>{`${part[0].toUpperCase()}${part.slice(1)}: ${result[part].ok ? 'worked' : result[part].reason || 'failed'}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
