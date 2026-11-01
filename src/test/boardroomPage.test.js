// 2.11.0 QA (owner, 2026-11-01): Mission Room was a fake meeting (no agent answered, you typed
// "as" an agent, its opening messages were made up). It is archived; Boardroom is the real
// sessions page, where agents answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the Boardroom page', () => {
  it('opens on Boardroom sessions, with no Mission Room tab', () => {
    const app = read('App.tsx');
    expect(app).not.toMatch(/components\/MissionRoom'/);
    expect(app).not.toMatch(/label: 'Mission Room'/);
    expect(app).toMatch(/function BoardroomPage\(/);
    expect(fs.existsSync(path.join(root, 'components/MissionRoom.tsx'))).toBe(false);
  });

  it('is titled Boardroom in the top bar', () => {
    expect(read('components/TopBar.tsx')).toMatch(/mission_room: 'Boardroom'/);
  });

  it('keeps the secret hiding and risk checks the sessions and Jose use', async () => {
    const service = await import('../services/missionRoomService');
    expect(typeof service.redactMissionRoomSecrets).toBe('function');
    expect(typeof service.classifyMissionRoomRisk).toBe('function');
  });
});
