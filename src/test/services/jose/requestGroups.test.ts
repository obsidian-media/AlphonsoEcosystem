// Jose phase 7: the board shows a project's requests together.
import { describe, it, expect } from 'vitest';
import { groupRequests } from '../../../services/jose/requestGroups';

const r = (id: string, atMs: number, group?: { id: string; label: string }): any => ({ id, createdAtMs: atMs, ...(group ? { group } : {}) });
const p1 = { id: 'p1', label: 'Honeybees' };

describe('groupRequests', () => {
  it("puts a project's requests together where its newest one is, newest first", () => {
    const list = [r('a', 50, p1), r('plain', 40), r('b', 30, p1), r('c', 10, p1)];
    expect(groupRequests(list).map((g) => [g.group?.id || null, g.requests.map((x) => x.id)])).toEqual([
      ['p1', ['a', 'b', 'c']],
      [null, ['plain']],
    ]);
  });

  it('a project whose newest request is older sits lower', () => {
    const list = [r('plain', 50), r('a', 40, p1), r('other', 30)];
    expect(groupRequests(list).map((g) => g.group?.id || g.requests[0].id)).toEqual(['plain', 'p1', 'other']);
  });

  it('requests without a group each stand alone', () => {
    expect(groupRequests([r('x', 2), r('y', 1)])).toHaveLength(2);
  });
});
