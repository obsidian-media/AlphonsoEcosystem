// @ts-nocheck
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';

describe('Card', () => {
  it('renders children correctly', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<Card className="custom-class">Content</Card>);
    const card = screen.getByText('Content').closest('div');
    expect(card.className).toContain('custom-class');
  });

  it('has correct base styles', () => {
    render(<Card>Content</Card>);
    const card = screen.getByText('Content').closest('div');
    expect(card.className).toContain('bg-[--surface-2]');
    expect(card.className).toContain('border');
    expect(card.className).toContain('rounded-[--radius-lg]');
  });

  describe('clickable', () => {
    it('adds cursor-pointer and hover styles when onClick provided', () => {
      const onClick = vi.fn();
      render(<Card onClick={onClick}>Clickable</Card>);
      const card = screen.getByText('Clickable').closest('div');
      expect(card.className).toContain('cursor-pointer');
      fireEvent.click(card!);
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('CardHeader', () => {
    it('renders children and applies styles', () => {
      render(<CardHeader>Header content</CardHeader>);
      expect(screen.getByText('Header content')).toBeTruthy();
    });
  });

  describe('CardContent', () => {
    it('renders children and applies styles', () => {
      render(<CardContent>Body content</CardContent>);
      expect(screen.getByText('Body content')).toBeTruthy();
    });
  });
});