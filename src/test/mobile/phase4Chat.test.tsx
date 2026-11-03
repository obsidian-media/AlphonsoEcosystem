// Phone phase 4: answering a waiting message on the phone, and the "On this phone" page.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatScreen } from '../../mobile/screens/Chat';
import { OnThisPhoneScreen } from '../../mobile/screens/OnThisPhone';
import type { ChatData, ChatMessage } from '../../services/phone/remoteData';
import type { PhoneOwnModels } from '../../mobile/phoneModels';

function fakeChat(messages: ChatMessage[]): ChatData & { answerHere: ReturnType<typeof vi.fn> } {
  return {
    messages: () => messages,
    send: vi.fn(async () => {}),
    subscribe: () => () => {},
    readOnly: false,
    answerHere: vi.fn(async () => {}),
    answering: () => null,
  };
}
const queued: ChatMessage = { id: 'm1', role: 'user', text: 'How many minutes is 2.5 hours?', atMs: 1, queued: true };

function models(over: Partial<PhoneOwnModels> = {}): PhoneOwnModels {
  return {
    answer: { asks: { phone: async () => null, openrouter: async () => null } },
    modelStatus: vi.fn(async () => ({ available: true, reason: null })),
    saveOpenRouterKey: vi.fn(async () => {}),
    hasOpenRouterKey: vi.fn(async () => false),
    ...over,
  };
}

describe('Chat while the computer is offline', () => {
  it('offers both ways to answer a waiting message here, and uses the one tapped', async () => {
    const chat = fakeChat([queued]);
    render(<ChatScreen chat={chat} offline models={models()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Answer on this phone' }));
    expect(chat.answerHere).toHaveBeenCalledWith('m1', 'phone');
    fireEvent.click(screen.getByRole('button', { name: 'Answer with OpenRouter (free)' }));
    expect(chat.answerHere).toHaveBeenCalledWith('m1', 'openrouter');
  });

  it('offers nothing while the computer is online, or without the phone models', () => {
    const { unmount } = render(<ChatScreen chat={fakeChat([queued])} offline={false} models={models()} />);
    expect(screen.queryByRole('button', { name: 'Answer on this phone' })).toBeNull();
    unmount();
    render(<ChatScreen chat={fakeChat([queued])} offline />);
    expect(screen.queryByRole('button', { name: 'Answer on this phone' })).toBeNull();
  });

  it("shows Apple's reason instead of the button when its model can't be used, read when the choice shows", async () => {
    const modelStatus = vi.fn(async () => ({ available: false, reason: 'appleIntelligenceNotEnabled' }));
    render(<ChatScreen chat={fakeChat([queued])} offline models={models({ modelStatus })} />);
    expect(await screen.findByText(/Apple Intelligence is off/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Answer on this phone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Answer with OpenRouter (free)' })).toBeTruthy();
    expect(modelStatus).toHaveBeenCalled();
  });

  it('labels an answer with where it came from, and shows why a message still waits', () => {
    render(<ChatScreen chat={fakeChat([
      { id: 'm0', role: 'user', text: 'hi', atMs: 1 },
      { id: 'm0-a', role: 'assistant', text: '150 minutes.', atMs: 1, answeredBy: 'openrouter' },
      { ...queued, note: 'This needs your computer. It will start when your computer is back.' },
    ])} offline models={models()} />);
    expect(screen.getByText('Answered with OpenRouter (free)')).toBeTruthy();
    expect(screen.getByText('This needs your computer. It will start when your computer is back.')).toBeTruthy();
  });

  it('shows the message being answered instead of the buttons', () => {
    const chat = { ...fakeChat([queued]), answering: () => 'm1' };
    render(<ChatScreen chat={chat} offline models={models()} />);
    expect(screen.getByText('Answering…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Answer on this phone' })).toBeNull();
  });
});

describe('On this phone', () => {
  it('saves the OpenRouter key to the keychain and clears the field', async () => {
    const m = models();
    render(<OnThisPhoneScreen models={m} />);
    fireEvent.change(screen.getByLabelText('OpenRouter key (free)'), { target: { value: 'sk-or-v1-abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Saved on this phone.')).toBeTruthy();
    expect(m.saveOpenRouterKey).toHaveBeenCalledWith('sk-or-v1-abc');
    expect((screen.getByLabelText('OpenRouter key (free)') as HTMLInputElement).value).toBe('');
  });

  it("says whether Apple's model is ready and whether a key is saved", async () => {
    render(<OnThisPhoneScreen models={models({ hasOpenRouterKey: vi.fn(async () => true) })} />);
    expect(await screen.findByText("Apple's model is ready on this iPhone.")).toBeTruthy();
    expect(await screen.findByText('A key is saved on this phone.')).toBeTruthy();
  });
});
