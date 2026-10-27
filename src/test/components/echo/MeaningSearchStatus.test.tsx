// Agent roles Part C2: Settings → Memory shows the meaning search's state in words, with its switch.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let current: any = { kind: 'off' };
let listener: ((s: any) => void) | null = null;
const ensure = vi.fn(async () => undefined);
vi.mock('../../../services/echo/meaning', () => ({
  ECHO_EMBED_MODEL: 'all-minilm',
  meaningState: () => current,
  onMeaningState: (l: (s: any) => void) => { listener = l; return () => { listener = null; }; },
  ensureMeaning: () => ensure(),
}));

import { MeaningSearchStatus } from '../../../components/echo/MeaningSearchStatus';

beforeEach(() => { current = { kind: 'off' }; ensure.mockClear(); });

describe('MeaningSearchStatus', () => {
  it.each([
    [{ kind: 'off' }, 'Off.'],
    [{ kind: 'no_ollama' }, 'Needs Ollama running.'],
    [{ kind: 'downloading', pct: 40 }, 'Downloading the meaning model (all-minilm, 46 MB): 40%'],
    [{ kind: 'indexing', done: 120, total: 300 }, 'Reading your decisions: 120 of 300'],
    [{ kind: 'ready' }, 'On.'],
    [{ kind: 'failed', reason: 'no space left' }, "Couldn't get the meaning model: no space left. Word search is used."],
  ])('says %o in words', (state, words) => {
    current = state;
    render(<MeaningSearchStatus settings={{ echoMeaningSearch: true }} setSettings={vi.fn()} />);
    expect(screen.getByTestId('echo-meaning-status').textContent).toContain(words);
  });

  it('the switch saves the setting, and turning it on gets the model ready', () => {
    const setSettings = vi.fn();
    const { rerender } = render(<MeaningSearchStatus settings={{ echoMeaningSearch: false }} setSettings={setSettings} />);
    const box = screen.getByLabelText('Match decisions by meaning') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ echoMeaningSearch: true }));
    expect(ensure).toHaveBeenCalled();
    rerender(<MeaningSearchStatus settings={{}} setSettings={setSettings} />);
    expect((screen.getByLabelText('Match decisions by meaning') as HTMLInputElement).checked).toBe(true);
  });

  it('follows the state as it changes', () => {
    render(<MeaningSearchStatus settings={{}} setSettings={vi.fn()} />);
    act(() => listener?.({ kind: 'ready' }));
    expect(screen.getByTestId('echo-meaning-status').textContent).toContain('On.');
  });
});
