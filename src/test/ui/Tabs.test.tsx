import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from '../../components/ui/Tabs';

describe('Tabs', () => {
  const tabs = [
    { id: 'tab1', label: 'First' },
    { id: 'tab2', label: 'Second' },
    { id: 'tab3', label: 'Third' },
  ];

  it('renders all tabs', () => {
    render(<Tabs tabs={tabs}>{(active) => <div>{active}</div>}</Tabs>);
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.getByText('Third')).toBeTruthy();
  });

  it('calls children function with active tab', () => {
    render(<Tabs tabs={tabs}>{(active) => <div data-testid="active">{active}</div>}</Tabs>);
    expect(screen.getByTestId('active').textContent).toBe('tab1');
  });

  it('switches tabs on click', () => {
    render(<Tabs tabs={tabs}>{(active) => <div data-testid="active">{active}</div>}</Tabs>);
    fireEvent.click(screen.getByText('Second'));
    expect(screen.getByTestId('active').textContent).toBe('tab2');
  });

  it('calls onChange when tab changes', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} onChange={onChange}>{(active) => <div>{active}</div>}</Tabs>);
    fireEvent.click(screen.getByText('Third'));
    expect(onChange).toHaveBeenCalledWith('tab3');
  });

  it('uses defaultTab when provided', () => {
    render(<Tabs tabs={tabs} defaultTab="tab3">{(active) => <div data-testid="active">{active}</div>}</Tabs>);
    expect(screen.getByTestId('active').textContent).toBe('tab3');
  });
});