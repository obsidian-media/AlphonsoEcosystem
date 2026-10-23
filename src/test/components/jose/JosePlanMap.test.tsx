import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JosePlanMap } from '../../../components/jose/JosePlanMap';

const steps = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read' as const], needs: [], instruction: 'Find the facts.', status: 'done' },
  { stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send' as const], needs: ['facts'], instruction: 'x'.repeat(300), status: 'waiting_approval' },
];

describe('JosePlanMap', () => {
  it('draws one box per step, with arrows, and says what it shows', () => {
    render(<JosePlanMap steps={steps} />);
    expect(screen.getAllByTestId('jose-plan-step')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /2 steps/ })).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="jose-plan-arrow"]')).toHaveLength(1);
    expect(screen.getByText('Hector')).toBeTruthy();
  });

  it('marks a step that waits for the user', () => {
    render(<JosePlanMap steps={steps} />);
    expect(screen.getByText('Waiting for you')).toBeTruthy();
  });

  it('cuts a long instruction and keeps the full text on hover', () => {
    render(<JosePlanMap steps={steps} />);
    const long = screen.getByTitle('x'.repeat(300));
    expect(long.textContent!.length).toBeLessThan(300);
  });

  it('shows only agent and status when compact', () => {
    render(<JosePlanMap steps={steps} compact />);
    expect(screen.queryByText('Find the facts.')).toBeNull();
    expect(screen.getByText('Hector')).toBeTruthy();
  });

  it('shows the model Jose chose for a step', () => {
    render(<JosePlanMap steps={[{ ...steps[0], model: 'qwen2.5:7b' }]} />);
    expect(screen.getByText(/qwen2\.5:7b/)).toBeTruthy();
  });

  it('marks a revision or re-review with its round', () => {
    render(<JosePlanMap steps={[{ ...steps[0], stepId: 'facts-fix-1', round: 1 }]} />);
    expect(screen.getByText('Round 1')).toBeTruthy();
  });

  it("shows a review's verdict", () => {
    render(<JosePlanMap steps={[{ ...steps[0], stepId: 'r', reviewOf: 'x', verdict: 'fix' }]} />);
    expect(screen.getByText(/Asked for changes/)).toBeTruthy();
  });
});
