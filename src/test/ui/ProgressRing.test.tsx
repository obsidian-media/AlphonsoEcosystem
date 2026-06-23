import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressRing } from '../../components/ui/ProgressRing';

describe('ProgressRing', () => {
  it('renders with default props', () => {
    render(<ProgressRing value={50} />);
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders two circles (track and progress)', () => {
    render(<ProgressRing value={50} />);
    const circles = document.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('applies correct color for progress circle', () => {
    render(<ProgressRing value={75} color="var(--success)" />);
    const progressCircle = document.querySelectorAll('circle')[1];
    expect(progressCircle).toBeTruthy();
  });

  it('renders with custom size', () => {
    render(<ProgressRing value={50} size={64} />);
    const svg = document.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('height')).toBe('64');
  });

  it('applies stroke width', () => {
    render(<ProgressRing value={50} stroke={6} />);
    const circles = document.querySelectorAll('circle');
    expect(circles[0]?.getAttribute('stroke-width')).toBe('6');
  });
});