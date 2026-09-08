import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeneratorForm } from '../../../features/content-catalyst/workspace/GeneratorForm';

const baseForm = { idea: '', business_context: '', platform: '', format: '', tone: '', pillar: '', needs: { image: false, video: false, narration: false, publish: false } };

describe('GeneratorForm', () => {
  it('renders the Create Content Job button, disabled with no idea', () => {
    render(<GeneratorForm form={baseForm} setForm={vi.fn()} brandProfile={{}} injectedIdea="" onIdeaUsed={vi.fn()} onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByText('Create Content Job').closest('button')).toBeDisabled();
  });

  it('calls onGenerate when clicked with a non-empty idea', () => {
    const onGenerate = vi.fn();
    render(<GeneratorForm form={{ ...baseForm, idea: 'A great idea' }} setForm={vi.fn()} brandProfile={{}} injectedIdea="" onIdeaUsed={vi.fn()} onGenerate={onGenerate} isLoading={false} />);
    fireEvent.click(screen.getByText('Create Content Job'));
    expect(onGenerate).toHaveBeenCalled();
  });
});
