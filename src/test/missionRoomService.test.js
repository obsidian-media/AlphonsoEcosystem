import { beforeEach, describe, expect, it } from 'vitest';

import {
  addMissionMessage,
  addMissionTask,
  classifyMissionRoomRisk,
  clearMissionMessages,
  createHermesHandoff,
  getMissionRoom,
  listMissionMessages,
  listMissionRooms,
  listMissionSecurityEvents,
  listMissionTasks,
  redactMissionRoomSecrets,
  updateMissionTask
} from '../services/missionRoomService';

beforeEach(() => {
  localStorage.clear();
});

describe('mission room service', () => {
  it('creates the default Shayan/Kite/Hermes room', () => {
    const rooms = listMissionRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].selectedAgents).toEqual(['shayan', 'alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova', 'kairo']);
    expect(rooms[0].openParticipantSlots).toHaveLength(0);
    expect(getMissionRoom().name).toContain('Mission Room');
  });

  it('stores local room messages and tasks', () => {
    const room = getMissionRoom();
    const message = addMissionMessage({ roomId: room.id, speaker: 'kite', content: 'Mission note' });
    const task = addMissionTask({ roomId: room.id, title: 'Audit TapCash', owner: 'hermes', acceptance: 'Report blockers.' });

    expect(message.content).toBe('Mission note');
    expect(listMissionMessages(room.id)).toHaveLength(1);
    expect(listMissionTasks(room.id)[0].title).toBe('Audit TapCash');

    const updated = updateMissionTask(task.id, { status: 'review', proof: 'lint passed' });
    expect(updated.status).toBe('review');
    expect(updated.proof).toBe('lint passed');

    clearMissionMessages(room.id);
    expect(listMissionMessages(room.id)).toHaveLength(0);
  });

  it('generates an approval-safe Hermes handoff', () => {
    const handoff = createHermesHandoff({
      project: 'TapCash',
      objective: 'Audit publish blockers.',
      acceptance: 'Readiness score and evidence.'
    });

    expect(handoff).toContain('Hermes');
    expect(handoff).toContain('TapCash');
    expect(handoff).toContain('Do not publish');
    expect(handoff).toContain('Final approval: Shayan');
    expect(handoff).toContain('stop and request Shayan approval');
  });

  it('redacts secrets, classifies risk, and writes security events', () => {
    const room = getMissionRoom();
    expect(redactMissionRoomSecrets('OPENAI_API_KEY=sk-abcdefghijklmnop')).toContain('[REDACTED_SECRET]');
    expect(classifyMissionRoomRisk('publish this to production').approvalRequired).toBe(true);

    const message = addMissionMessage({
      roomId: room.id,
      speaker: 'intruder',
      content: 'publish with NOTION_TOKEN=ntn_abcdefghijklmnop'
    });
    expect(message.speaker).toBe('shayan');
    expect(message.content).toContain('[REDACTED_SECRET]');
    expect(message.approvalRequired).toBe(true);

    const task = addMissionTask({
      roomId: room.id,
      title: 'Delete production webhook',
      owner: 'unknown-agent',
      status: 'bad-status'
    });
    expect(task.owner).toBe('hermes');
    expect(task.status).toBe('todo');
    expect(task.approvalRequired).toBe(true);

    const events = listMissionSecurityEvents(room.id);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].eventHash).toMatch(/^fnv1a_/);
  });
});
