// Phase 4a: a post's 7-day reading starts its lessons (and, from Task 10, its ideas).
import { describe, it, expect, vi } from 'vitest';

const listeners: ((projectId: string, postId: string) => void)[] = [];
vi.mock('../../../services/contentFactory/postMetrics', () => ({ onSevenDays: (l: (p: string, i: string) => void) => { listeners.push(l); return () => undefined; } }));
vi.mock('../../../services/contentFactory/performanceLessons', () => ({ proposeLessons: vi.fn(async () => ({ ok: true })) }));

import { startContentLearning } from '../../../services/contentFactory/contentLearning';
import { proposeLessons } from '../../../services/contentFactory/performanceLessons';

describe('startContentLearning', () => {
  it('asks for lessons after a 7-day reading, and listens only once', () => {
    startContentLearning();
    startContentLearning();
    expect(listeners).toHaveLength(1);
    listeners[0]('p1', 'post1');
    expect(proposeLessons).toHaveBeenCalledWith('p1', 'post1');
  });
});
