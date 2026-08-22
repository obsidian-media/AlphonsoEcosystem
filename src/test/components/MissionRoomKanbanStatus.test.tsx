import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Regression / re-verification test for a real QA finding (Q&A E2E Test.md
// N-16, Round 3): "Boardroom kanban has zero draggable nodes at all.
// [draggable="true"] -> 0 nodes... The 5 lanes are a static display."
//
// Checked the current code directly before assuming this is still a bug:
// MissionRoom.tsx (the actual "5 lanes" UI QA was describing — the rebuilt
// BoardroomChatView.tsx has no kanban at all, by design, see CLAUDE.md's
// "Boardroom sessions" entry listing "cards" as deliberately deferred scope)
// never implemented drag-and-drop, but each TaskCard already has a working
// <select> dropdown that changes task.status and persists it via
// updateMissionTask() — a real click-based way to move a task between
// lanes, just not a drag gesture. QA's own Round 1 report explicitly asked
// for exactly this ("add a click/menu fallback; drag-only kanbans are
// unusable with a trackpad") — it already exists. This test proves it
// actually works end-to-end against the real service (not mocked), so it
// can't silently regress.

import { MissionRoom } from '../../components/MissionRoom';
import { listMissionTasks, addMissionTask } from '../../services/missionRoomService';

describe('MissionRoom task status change (kanban lane move via click, not drag)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('moves a task to a different lane when its status dropdown is changed, and persists it', () => {
    const created = addMissionTask({
      roomId: 'mission_room_main',
      title: 'Regression-test task',
      owner: 'hermes',
      status: 'todo',
      priority: 'P1'
    });
    expect(created).toBeTruthy();

    render(<MissionRoom />);

    const taskCard = screen.getAllByText('Regression-test task')[0].closest('.rounded-3xl');
    const statusSelect = taskCard?.querySelector('select') as HTMLSelectElement;
    expect(statusSelect).toBeTruthy();
    expect(statusSelect.value).toBe('todo');

    fireEvent.change(statusSelect, { target: { value: 'doing' } });

    expect(statusSelect.value).toBe('doing');
    const persisted = listMissionTasks('mission_room_main').find((t) => t.title === 'Regression-test task');
    expect(persisted?.status).toBe('doing');
  });
});
