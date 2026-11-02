// Owner, 2026-11-02: ComfyUI was given the request word for word ("now be creative and generate an
// image of your thought"). Miya's model writes what the picture shows first, from the request and,
// for a change, the earlier picture's description.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));

const { writePicturePrompt, MIYA_PROMPT_UNREAD } = await import('../../../services/contentFactory/picturePrompt');

const EARLIER = { path: 'Miya/2026-11-01/picture-234435-a3cd4928.png', prompt: 'a beagle in an orange pumpkin costume, studio light' };

beforeEach(() => { llm.mockReset(); });

describe('writePicturePrompt', () => {
  it("Miya's model writes what the picture shows, without the request's own wording", async () => {
    llm.mockResolvedValue({ response: '{"description":"a lighthouse on a cliff at night, stars, long exposure","useEarlier":false}' });
    const r = await writePicturePrompt('now be creative and generate an image of a lighthouse at night', null);
    expect(r).toEqual({ description: 'a lighthouse on a cliff at night, stars, long exposure', useEarlier: false, note: null });
    expect(llm).toHaveBeenCalledWith('miya', expect.objectContaining({ format: 'json' }));
    expect(String(llm.mock.calls[0][1].prompt)).toContain('now be creative and generate an image of a lighthouse at night');
  });

  it('for a change, she is given the earlier picture and keeps its subject', async () => {
    llm.mockResolvedValue({ response: '{"description":"a beagle in a pirate costume, studio light","useEarlier":true}' });
    const r = await writePicturePrompt('now make the same dog wear a different costume', EARLIER);
    expect(r).toMatchObject({ description: 'a beagle in a pirate costume, studio light', useEarlier: true });
    expect(String(llm.mock.calls[0][1].prompt)).toContain(EARLIER.prompt);
  });

  it('never starts from an earlier picture there is none of', async () => {
    llm.mockResolvedValue({ response: '{"description":"a cat","useEarlier":true}' });
    expect((await writePicturePrompt('a cat', null)).useEarlier).toBe(false);
  });

  it('an unreadable answer is asked again once', async () => {
    llm.mockResolvedValueOnce({ response: 'Sure! Here is a lovely picture idea.' })
      .mockResolvedValueOnce({ response: '{"description":"a red fox in snow","useEarlier":false}' });
    const r = await writePicturePrompt('draw a fox in the snow', null);
    expect(r.description).toBe('a red fox in snow');
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("when her model can't answer, the request's own words are used and the step says so", async () => {
    llm.mockRejectedValue(new Error('Ollama is not running'));
    const r = await writePicturePrompt('draw a fox in the snow', EARLIER);
    expect(r).toEqual({ description: 'draw a fox in the snow', useEarlier: false, note: MIYA_PROMPT_UNREAD });
  });

  it('a very long description is cut to what the picture model reads', async () => {
    llm.mockResolvedValue({ response: JSON.stringify({ description: 'word '.repeat(400), useEarlier: false }) });
    const r = await writePicturePrompt('a forest', null);
    expect(r.description.length).toBeLessThanOrEqual(600);
  });
});
