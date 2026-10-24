// What happens after a post's 7-day reading (content factory phase 4a): Nova and Miya
// propose lessons from it. Started once by Marcus's runner, loaded lazily so the runner
// doesn't pull the whole content factory in at start.
import { onSevenDays } from './postMetrics';
import { proposeLessons } from './performanceLessons';

let started = false;

export function startContentLearning(): void {
  if (started) return;
  started = true;
  onSevenDays((projectId, postId) => {
    void proposeLessons(projectId, postId).catch(() => undefined);
  });
}
