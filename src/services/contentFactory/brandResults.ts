// How a post did against its own brand (content factory phase 4a): the brand's median on
// the same platform at the same checkpoint. Good above 1.5 × median, weak below half,
// usual otherwise; with fewer than 3 other posts there is nothing to compare yet.
import { listProjects } from './contentProjectService';
import { measurablePosts, needsPermission } from './postMetrics';
import type { Checkpoint, MetricsReading, PostPlatform, ProjectPost } from './contentTypes';

export const BANDS = { good: 1.5, weak: 0.5 } as const;
export const MIN_POSTS_TO_COMPARE = 3;
export const MAIN_METRIC = 'views';
export const FIRST_POSTS = 'First posts: nothing to compare with yet';

export type Band = 'good' | 'weak' | 'usual' | 'first';

function mainValue(post: ProjectPost, checkpoint: Checkpoint): number | null {
  const value = post.metrics?.readings?.[checkpoint]?.values?.[MAIN_METRIC];
  return typeof value === 'number' ? value : null;
}

function brandValues(brandId: string, platform: PostPlatform, checkpoint: Checkpoint, excludePostId?: string): number[] {
  return measurablePosts()
    .filter((m) => m.brandId === brandId && m.post.platform === platform && m.post.id !== excludePostId)
    .map((m) => mainValue(m.post, checkpoint))
    .filter((v): v is number => v !== null);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The brand's usual main number on a platform at a checkpoint, leaving one post out. */
export function brandMedian(brandId: string, platform: PostPlatform, checkpoint: Checkpoint, excludePostId?: string): number | null {
  return median(brandValues(brandId, platform, checkpoint, excludePostId));
}

/** Good, weak or usual against the brand; 'first' with too few others; null without the number. */
export function postBand(post: ProjectPost, brandId: string, checkpoint: Checkpoint): Band | null {
  const value = mainValue(post, checkpoint);
  if (value === null) return null;
  const others = brandValues(brandId, post.platform, checkpoint, post.id);
  if (others.length < MIN_POSTS_TO_COMPARE) return 'first';
  const m = median(others) as number;
  if (m === 0) return value > 0 ? 'good' : 'usual';
  if (value > BANDS.good * m) return 'good';
  if (value < BANDS.weak * m) return 'weak';
  return 'usual';
}

export interface BrandResultRow { projectId: string; projectName: string; post: ProjectPost; sevenDay: MetricsReading; band: Band | null }

/** Every post of the brand with its 7-day numbers. */
export function brandResultRows(brandId: string): BrandResultRow[] {
  const rows: BrandResultRow[] = [];
  for (const project of listProjects(brandId)) {
    for (const post of project.posts || []) {
      const sevenDay = post.metrics?.readings?.['7d'];
      if (sevenDay) rows.push({ projectId: project.id, projectName: project.name, post, sevenDay, band: postBand(post, brandId, '7d') });
    }
  }
  return rows;
}

/** One banner per service that needs a new sign-in to read numbers. */
export function permissionBanners(): string[] {
  const need = needsPermission();
  return [
    need.youtube ? 'Sign in again to see YouTube numbers' : '',
    need.meta ? 'Sign in again to see Facebook and Instagram numbers' : '',
    need.instagram ? 'Sign in again with Instagram to see Instagram numbers' : '',
  ].filter(Boolean);
}
