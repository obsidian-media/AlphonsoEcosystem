// What happens after a post's 7-day reading (content factory phase 4a): Nova and Miya
// propose lessons from it, and Nova follow-up ideas when it did well. Started once by
// Marcus's runner, loaded lazily so the runner doesn't pull the whole content factory in.
import { onSevenDays } from './postMetrics';
import { proposeLessons } from './performanceLessons';
import { proposeIdeas } from './contentIdeas';

let started = false;

export function startContentLearning(): void {
  if (started) return;
  started = true;
  onSevenDays((projectId, postId) => {
    void proposeLessons(projectId, postId).catch(() => undefined);
    void proposeIdeas(projectId, postId).catch(() => undefined);
  });
}
