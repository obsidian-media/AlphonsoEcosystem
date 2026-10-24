import React from 'react';
import { brandResultRows, permissionBanners } from '../../services/contentFactory/brandResults';
import { PostNumbers } from './PostNumbers';

/** The brand's posts with their 7-day numbers, compared with the brand (phase 4a). */
export function BrandResults({ brandId, children }: { brandId: string; children?: React.ReactNode }) {
  const rows = brandResultRows(brandId);
  return (
    <section aria-label="Results" className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Results</div>
      {permissionBanners().map((banner) => (
        <p key={banner} role="status" className="rounded-xl bg-(--surface-2) px-3 py-2 text-[12px] text-(--warning)">{banner}</p>
      ))}
      {rows.length === 0 && <p className="text-[12px] text-(--text-3)">No numbers yet: posts get theirs 1 hour, 1 day, 7 days and 30 days after they go out.</p>}
      {rows.map((row) => (
        <div key={`${row.projectId}-${row.post.id}`} data-testid={`result-${row.post.id}`} className="rounded-xl bg-(--surface-2) p-2">
          <div className="text-[12px] font-semibold text-(--text-1)">{row.post.title}</div>
          <div className="text-[11px] text-(--text-3)">{row.projectName}{row.band && row.band !== 'first' ? ` · ${row.band}` : ''}</div>
          <PostNumbers projectId={row.projectId} brandId={brandId} post={row.post} compact />
        </div>
      ))}
      {children}
    </section>
  );
}
