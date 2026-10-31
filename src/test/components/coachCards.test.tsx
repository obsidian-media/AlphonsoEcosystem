// Coach Mode's gambling numbers and its Pause / End session buttons belong to SessionGuard's
// check-ins; Alphonso's own coach check-ins show only their message and Continue
// (owner, 2026-10-30: hidden until SessionGuard is connected).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoachInterventionCard } from '../../components/CoachInterventionCard';
import { CoachHardInterruptOverlay } from '../../components/CoachHardInterruptOverlay';

const coachCheckIn = { level: 'firm', source: 'coach-engine', title: 'Coach check-in', message: 'Five approvals in two minutes.' };
const sessionGuardCheckIn = { ...coachCheckIn, source: 'sessionguard', metrics: { spinCount: 40, netResult: -12, longestLosingStretch: 6 } };

describe('CoachInterventionCard', () => {
  it("Alphonso's own check-in shows its message and Continue, without gambling numbers or Pause / End session", () => {
    const onAction = vi.fn();
    render(<CoachInterventionCard intervention={coachCheckIn} onAction={onAction} pauseUntilMs={0} />);
    expect(screen.getByText('Five approvals in two minutes.')).toBeTruthy();
    expect(screen.queryByText(/Spins/)).toBeNull();
    expect(screen.queryByText('Pause 60s')).toBeNull();
    expect(screen.queryByText('End session')).toBeNull();
    fireEvent.click(screen.getByText('Continue'));
    expect(onAction).toHaveBeenCalledWith('continue');
  });

  it("a SessionGuard check-in shows its numbers and the session buttons", () => {
    render(<CoachInterventionCard intervention={sessionGuardCheckIn} pauseUntilMs={0} />);
    expect(screen.getByText(/Spins/)).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('Pause 60s')).toBeTruthy();
    expect(screen.getByText('End session')).toBeTruthy();
  });

  it('with no check-in it says so without promising a session bridge', () => {
    render(<CoachInterventionCard intervention={null} pauseUntilMs={0} />);
    expect(screen.getByText('No active intervention.')).toBeTruthy();
    expect(screen.queryByText(/Local bridge is ready/)).toBeNull();
  });
});

describe('CoachHardInterruptOverlay', () => {
  it("Alphonso's own hard check-in has no gambling numbers or End session", () => {
    render(<CoachHardInterruptOverlay intervention={{ ...coachCheckIn, level: 'hard' }} pauseUntilMs={0} />);
    expect(screen.getByText('Five approvals in two minutes.')).toBeTruthy();
    expect(screen.queryByText(/Spins/)).toBeNull();
    expect(screen.queryByText('End session')).toBeNull();
    expect(screen.getByText('Continue anyway')).toBeTruthy();
  });

  it('a SessionGuard hard check-in keeps its numbers and End session', () => {
    render(<CoachHardInterruptOverlay intervention={{ ...sessionGuardCheckIn, level: 'hard' }} pauseUntilMs={0} />);
    expect(screen.getByText(/Spins/)).toBeTruthy();
    expect(screen.getByText('End session')).toBeTruthy();
  });
});
