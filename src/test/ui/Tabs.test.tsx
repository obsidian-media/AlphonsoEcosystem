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
    render(<Tabs tabs={tabs} activeId="tab1" onChange={() => {}} />);
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.getByText('Third')).toBeTruthy();
  });

  it('marks the active tab via aria-pressed', () => {
    render(<Tabs tabs={tabs} activeId="tab2" onChange={() => {}} />);
    expect(screen.getByText('First').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Second').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeId="tab1" onChange={onChange} />);
    fireEvent.click(screen.getByText('Third'));
    expect(onChange).toHaveBeenCalledWith('tab3');
  });

  it('does not call onChange for a disabled tab', () => {
    const onChange = vi.fn();
    const withDisabled = [...tabs.slice(0, 2), { id: 'tab3', label: 'Third', disabled: true }];
    render(<Tabs tabs={withDisabled} activeId="tab1" onChange={onChange} />);
    fireEvent.click(screen.getByText('Third'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders in compact mode without throwing', () => {
    render(<Tabs tabs={tabs} activeId="tab1" onChange={() => {}} compact />);
    expect(screen.getByText('First')).toBeTruthy();
  });
});
