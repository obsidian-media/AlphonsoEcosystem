// Phone phase 4: what the phone may answer on its own, and what waits for the computer.
import { describe, expect, it, vi } from 'vitest';
import { NEEDS_COMPUTER, phoneRoute } from '../../../services/phone/phoneRoute';

const never = () => vi.fn(async () => { throw new Error('the model should not be asked'); });

describe('phoneRoute', () => {
  it.each([
    'post our new opening hours on Slack',
    'send Sam the meeting notes from today',
    'publish the post',
    'upload the video',
    'Change the price of the blue mug in my shop project to 18 dollars.',
    'Remember that the launch is Friday',
  ])('sends "%s" to the computer without asking the model', async (text) => {
    const ask = never();
    const r = await phoneRoute(text, ask);
    expect(r.route).toBe('computer');
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers a plain question without asking the model', async () => {
    const ask = never();
    expect((await phoneRoute('How many minutes is 2.5 hours?', ask)).route).toBe('answer');
    expect(ask).not.toHaveBeenCalled();
  });

  it("follows Jose's model, fenced answer and all", async () => {
    const direct = vi.fn(async () => '```json\n{"route":"direct","reason":"chat"}\n```');
    expect((await phoneRoute('thanks, that was really helpful', direct)).route).toBe('answer');
    expect(direct).toHaveBeenCalledWith('', expect.stringContaining('Message: thanks, that was really helpful'));
    expect((await phoneRoute('thanks, that was really helpful', async () => '{"route":"plan"}')).route).toBe('computer');
  });

  it('leaves everyday writing to the phone (the test round\'s Alphonso questions)', async () => {
    const direct = async () => '{"route":"direct"}';
    for (const text of [
      'Write a short, friendly email to Sam saying the meeting moves from Tuesday to Thursday at 3pm.',
      "Write an Instagram caption for a bakery's new cinnamon bun, under 30 words, with two hashtags.",
      'When is the spring launch, and why that date?',
    ]) expect((await phoneRoute(text, direct)).route).toBe('answer');
  });

  it("sends it to the computer when Jose can't decide on the phone", async () => {
    for (const ask of [async () => { throw new Error('model off'); }, async () => 'no idea']) {
      expect(await phoneRoute('thanks, that was really helpful', ask)).toEqual({ route: 'computer', reason: "Jose couldn't decide on this phone." });
    }
  });

  it('says plainly why a message waits', () => {
    expect(NEEDS_COMPUTER).toBe('This needs your computer. It will start when your computer is back.');
  });
});
