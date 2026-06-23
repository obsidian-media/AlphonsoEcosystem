import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../components/ui/Badge';
import { StatusDot } from '../../components/ui/StatusDot';

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Default badge</Badge>);
    expect(screen.getByText('Default badge')).toBeTruthy();
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Badge variant="default">Default</Badge>);
      const badge = screen.getByText('Default').closest('span');
      expect(badge.className).toContain('bg-surface-3');
    });

    it('renders success variant', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByText('Success').closest('span');
      expect(badge.className).toContain('text-[--success]');
    });

    it('renders warning variant', () => {
      render(<Badge variant="warning">Warning</Badge>);
      const badge = screen.getByText('Warning').closest('span');
      expect(badge.className).toContain('text-[--warning]');
    });

    it('renders error variant', () => {
      render(<Badge variant="error">Error</Badge>);
      const badge = screen.getByText('Error').closest('span');
      expect(badge.className).toContain('text-[--error]');
    });

    it('renders info variant', () => {
      render(<Badge variant="info">Info</Badge>);
      const badge = screen.getByText('Info').closest('span');
      expect(badge.className).toContain('text-[--info]');
    });

    it('renders accent variant', () => {
      render(<Badge variant="accent">Accent</Badge>);
      const badge = screen.getByText('Accent').closest('span');
      expect(badge.className).toContain('text-accent');
    });
  });

  describe('dot prop', () => {
    it('renders dot indicator when dot is true', () => {
      render(<Badge dot>Dotted</Badge>);
      const dot = screen.getByText('Dotted').querySelector('span.w-1\\.5');
      expect(dot).toBeTruthy();
    });
  });
});

describe('StatusDot', () => {
  it('renders online status', () => {
    render(<StatusDot status="online" />);
    const dot = screen.getByRole('status') || document.querySelector('.bg-\\[--success\\]');
    expect(document.querySelector('span')).toBeTruthy();
  });

  it('renders offline status', () => {
    render(<StatusDot status="offline" />);
    expect(document.querySelector('span')).toBeTruthy();
  });

  it('renders pending status with pulse animation', () => {
    render(<StatusDot status="pending" />);
    const dot = document.querySelector('span');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('renders md size when specified', () => {
    render(<StatusDot status="online" size="md" />);
    const dot = document.querySelector('span');
    expect(dot?.className).toContain('w-2\\.5');
  });
});