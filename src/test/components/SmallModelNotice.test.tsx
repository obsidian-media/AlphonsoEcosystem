// QA batch 1 (live check of 2.10.0, 2026-10-28): with qwen3:0.6b Jose copied his example plan and
// Alphonso gave no usable change. Owner: warn in Chat and Settings when the model is too small.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmallModelNotice, SMALL_MODEL_NOTE } from '../../components/SmallModelNotice';

describe('SmallModelNotice', () => {
  it('warns for a model under 3B, by the size in its name', () => {
    render(<SmallModelNotice model="qwen3:0.6b" />);
    expect(screen.getByTestId('small-model-notice').textContent).toBe(SMALL_MODEL_NOTE('qwen3:0.6b'));
    expect(SMALL_MODEL_NOTE('qwen3:0.6b')).toBe('qwen3:0.6b is very small: plans and code may fail. A 3B or larger model works better (the tests use qwen2.5:7b).');
  });

  it('says nothing for a 3B or larger model, or one whose size the name does not give', () => {
    const { container } = render(<><SmallModelNotice model="llama3.2:3b" /><SmallModelNotice model="qwen2.5:7b" /><SmallModelNotice model="mistral:latest" /><SmallModelNotice model="" /></>);
    expect(container.textContent).toBe('');
  });

  it('the short form keeps the full sentence as its tooltip', () => {
    render(<SmallModelNotice model="qwen2.5:1.5b" short />);
    const notice = screen.getByTestId('small-model-notice');
    expect(notice.textContent).toBe('Very small model');
    expect(notice.getAttribute('title')).toBe(SMALL_MODEL_NOTE('qwen2.5:1.5b'));
  });
});
