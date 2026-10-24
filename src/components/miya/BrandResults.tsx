import React, { useState } from 'react';
import { Button } from '../ui';
import { dropLesson, editLesson, keepLesson, proposedLessons } from '../../services/contentFactory/contentBrandService';
import { brandResultRows, permissionBanners } from '../../services/contentFactory/brandResults';
import { PostNumbers } from './PostNumbers';

/** The brand's posts with their 7-day numbers, compared with the brand (phase 4a). */
export function BrandResults({ brandId, children }: { brandId: string; children?: React.ReactNode }) {
  const [, setTick] = useState(0);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const rows = brandResultRows(brandId);
  const proposed = proposedLessons(brandId);
  const after = () => setTick((t) => t + 1);
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
      {proposed.length > 0 && (
        <div className="space-y-1" aria-label="Lessons to keep or drop">
          <div className="text-[11px] font-semibold text-(--text-2)">Lessons from these numbers (kept ones reach the next projects)</div>
          {proposed.map((lesson) => (
            <div key={lesson.id} className="flex flex-wrap items-center gap-1 text-[12px] text-(--text-2)">
              <span className="text-(--text-3)">{lesson.kind === 'didnt' ? "Didn't work:" : 'Worked:'}</span> <span>{lesson.text}</span>
              <Button size="sm" variant="ghost" aria-label={`Keep lesson: ${lesson.text}`} onClick={() => { keepLesson(brandId, lesson.id as string); after(); }}>Keep</Button>
              <Button size="sm" variant="ghost" aria-label={`Edit lesson: ${lesson.text}`} onClick={() => setEditing({ id: lesson.id as string, text: lesson.text })}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`Drop lesson: ${lesson.text}`} onClick={() => { dropLesson(brandId, lesson.id as string); after(); }}>Drop</Button>
            </div>
          ))}
          {editing && (
            <div className="flex flex-wrap gap-1">
              <input aria-label="Lesson text" className="min-w-0 flex-1 rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
              <Button size="sm" variant="secondary" aria-label="Keep edited lesson" onClick={() => { editLesson(brandId, editing.id, editing.text); setEditing(null); after(); }}>Keep</Button>
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
