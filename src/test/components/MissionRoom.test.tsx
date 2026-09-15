import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/missionRoomService', () => ({
  MISSION_ROOM_AGENTS: {
    alphonso: { key: 'alphonso', name: 'Alphonso', role: 'operator', lane: 'L1', accent: 'emerald' },
    jose: { key: 'jose', name: 'Jose', role: 'orchestrator', lane: 'L1', accent: 'cyan' }
  },
  MISSION_ROOM_SECURITY_MODEL: {
    scope: 'local_browser_guardrail',
    guarantees: ['Messages are redacted.'],
    nonGuarantees: ['localStorage is not tamper-proof.']
  },
  MISSION_TASK_STATUSES: ['todo', 'doing', 'review', 'approved', 'blocked'],
  addMissionMessage: vi.fn(),
  addMissionTask: vi.fn(),
  clearMissionMessages: vi.fn(),
  createHermesHandoff: vi.fn(),
  getMissionRoom: vi.fn(() => ({
    id: 'room1',
    name: 'Mission Room',
    selectedAgents: ['alphonso', 'jose'],
    openParticipantSlots: []
  })),
  listMissionMessages: vi.fn(() => []),
  listMissionSecurityEvents: vi.fn(() => []),
  listMissionTasks: vi.fn(() => []),
  updateMissionTask: vi.fn()
}));

import { MissionRoom } from '../../components/MissionRoom';
import { listMissionTasks, listMissionMessages } from '../../services/missionRoomService';

describe('MissionRoom', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<MissionRoom />);
    expect(container).toBeTruthy();
  });

  it('renders with an approval callback', () => {
    const { container } = render(<MissionRoom onCreateApprovalRequest={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('renders with existing mission tasks', () => {
    (listMissionTasks as any).mockReturnValueOnce([
      { id: 't1', title: 'Design packet', status: 'pending', riskLevel: 'low' }
    ]);
    const { container } = render(<MissionRoom />);
    expect(container).toBeTruthy();
  });

  it('renders with existing messages', () => {
    (listMissionMessages as any).mockReturnValueOnce([
      { id: 'm1', author: 'alphonso', text: 'Mission started', createdAtMs: Date.now() }
    ]);
    const { container } = render(<MissionRoom />);
    expect(container).toBeTruthy();
  });
});