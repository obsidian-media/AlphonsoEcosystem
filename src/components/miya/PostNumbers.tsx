import React, { useState } from 'react';
import { Button } from '../ui';
import { refreshPostMetrics } from '../../services/contentFactory/postMetrics';
import { FIRST_POSTS, postBand, type Band } from '../../services/contentFactory/brandResults';
import type { Checkpoint, PostPlatform, ProjectPost } from '../../services/contentFactory/contentTypes';

const PLATFORM_NAME: Record<PostPlatform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const KEYS: Record<PostPlatform, string[]> = {
  youtube: ['views', 'watchMinutes', 'averageViewSeconds', 'likes', 'comments', 'shares', 'subscribersGained'],
  instagram: ['views', 'reach', 'likes', 'comments', 'saves', 'shares'],
  facebook: ['views', 'reach', 'reactions', 'comments', 'shares'],
};
const LABEL: Record<string, string> = {
  views: 'views', reach: 'reached', likes: 'likes', comments: 'comments', saves: 'saves', shares: 'shares', reactions: 'reactions',
  watchMinutes: 'minutes watched', averageViewSeconds: 's average view', subscribersGained: 'new subscribers',
};
const CHECKPOINT_LABEL: Record<Checkpoint, string> = { '1h': 'after 1 hour', '1d': 'after 1 day', '7d': 'after 7 days', '30d': 'after 30 days' };
const ORDER: Checkpoint[] = ['1h', '1d', '7d', '30d'];
const BAND_LABEL: Record<Band, string> = { good: 'good for this brand', weak: 'weak for this brand', usual: 'usual for this brand', first: FIRST_POSTS };

/** A post's latest numbers, how they compare with its brand, and Refresh (phase 4a). */
export function PostNumbers({ projectId, brandId, post, compact = false }: { projectId: string; brandId: string | null; post: ProjectPost; compact?: boolean }) {
  const [message, setMessage] = useState('');
  const metrics = post.metrics;
  const name = PLATFORM_NAME[post.platform];
  if (metrics?.removed) return <p className="text-[11px] text-(--text-3)">— removed from {name}</p>;
  const latest = ORDER.filter((c) => metrics?.readings?.[c]).pop();
  const refresh = async () => {
    setMessage('');
    const result = await refreshPostMetrics(projectId, post.id);
    setMessage(result.ok ? 'Numbers read just now.' : result.reason || 'The numbers could not be read.');
  };
  const reading = latest ? metrics!.readings[latest]! : null;
  const band = latest && brandId ? postBand(post, brandId, latest) : null;
  const keys = compact ? KEYS[post.platform].slice(0, 3) : KEYS[post.platform];
  return (
    <div className="space-y-1 text-[11px] text-(--text-2)" aria-label={`Numbers for ${post.title}`}>
      {reading ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {keys.map((key) => {
              const value = reading.values[key];
              const known = typeof value === 'number';
              return (
                <span key={key} data-testid={`metric-${key}`} title={known ? undefined : `not available from ${name}`}>
                  <strong className="text-(--text-1)">{known ? Math.round(value).toLocaleString('en-US') : '—'}</strong> <span>{LABEL[key]}</span>
                </span>
              );
            })}
          </div>
          <div className="text-(--text-3)"><span>{CHECKPOINT_LABEL[latest!]}</span>{band && <> · <span data-testid="post-band">{BAND_LABEL[band]}</span></>}</div>
        </>
      ) : (
        <p className="text-(--text-3)">No numbers yet.</p>
      )}
      {post.platformId && (
        <Button size="sm" variant="ghost" aria-label="Refresh numbers" onClick={() => { void refresh(); }}>Refresh</Button>
      )}
      {message && <p className="text-(--text-3)">{message}</p>}
    </div>
  );
}
