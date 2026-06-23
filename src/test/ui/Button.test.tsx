import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../components/ui/Button';

describe('Button', () => {
  describe('variants', () => {
    it('renders primary variant with correct classes', () => {
      render(<Button variant="primary">Primary</Button>);
      const btn = screen.getByText('Primary').closest('button');
      expect(btn.className).toContain('bg-accent');
      expect(btn.className).toContain('text-white');
    });

    it('renders secondary variant with correct classes', () => {
      render(<Button variant="secondary">Secondary</Button>);
      const btn = screen.getByText('Secondary').closest('button');
      expect(btn.className).toContain('bg-surface-3');
    });

    it('renders ghost variant with correct classes', () => {
      render(<Button variant="ghost">Ghost</Button>);
      const btn = screen.getByText('Ghost').closest('button');
      expect(btn.className).toContain('bg-transparent');
    });

    it('renders danger variant with correct classes', () => {
      render(<Button variant="danger">Danger</Button>);
      const btn = screen.getByText('Danger').closest('button');
      expect(btn.className).toContain('text-[--error]');
    });

    it('renders success variant with correct classes', () => {
      render(<Button variant="success">Success</Button>);
      const btn = screen.getByText('Success').closest('button');
      expect(btn.className).toContain('text-[--success]');
    });
  });

  describe('sizes', () => {
    it('renders sm size with correct classes', () => {
      render(<Button size="sm">Small</Button>);
      const btn = screen.getByText('Small').closest('button');
      expect(btn.className).toContain('px-2.5');
      expect(btn.className).toContain('py-1');
      expect(btn.className).toContain('text-xs');
    });

    it('renders md size with correct classes (default)', () => {
      render(<Button>Medium</Button>);
      const btn = screen.getByText('Medium').closest('button');
      expect(btn.className).toContain('px-3.5');
      expect(btn.className).toContain('text-sm');
    });

    it('renders lg size with correct classes', () => {
      render(<Button size="lg">Large</Button>);
      const btn = screen.getByText('Large').closest('button');
      expect(btn.className).toContain('px-5');
      expect(btn.className).toContain('text-base');
    });
  });

  describe('loading state', () => {
    it('shows spinner when loading', () => {
      render(<Button loading>Loading</Button>);
      const spinner = screen.getByRole('button').querySelector('span.animate-spin');
      expect(spinner).toBeTruthy();
    });

    it('disables button when loading', () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole('button').disabled).toBe(true);
    });
  });

  describe('disabled state', () => {
    it('disables button when disabled prop is set', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button').disabled).toBe(true);
    });
  });

  describe('icon prop', () => {
    it('renders icon alongside children', () => {
      render(<Button icon={<span data-testid="icon">🔔</span>}>With Icon</Button>);
      expect(screen.getByTestId('icon')).toBeTruthy();
      expect(screen.getByText('With Icon')).toBeTruthy();
    });
  });
});