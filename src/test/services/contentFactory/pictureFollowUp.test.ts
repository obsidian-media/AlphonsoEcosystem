// Owner, 2026-11-02: after a picture of a dog, "now make the same dog wear a different costume"
// went to Alphonso, who answered in words. A message that refers back to a picture just shown in
// this chat is Miya's next picture, with the earlier one to start from.
import { describe, it, expect, beforeEach } from 'vitest';
import { earlierPictureFor } from '../../../services/contentFactory/pictureFollowUp';
import { chatMediaLine } from '../../../services/contentFactory/chatMediaStore';

const DOG = { id: 'media-1', kind: 'picture' as const, prompt: 'a beagle in an orange pumpkin costume', path: 'Miya/2026-11-01/picture-234435-a3cd4928.png', status: 'done' as const, atMs: 1 };

function savePictures(list: unknown[]) {
  localStorage.setItem('alphonso_chat_media_v1', JSON.stringify(list));
}

const shown = [
  { role: 'user', content: 'generate an image of a dog wearing holloween costume' },
  { role: 'assistant', content: chatMediaLine(DOG) },
];

beforeEach(() => {
  localStorage.clear();
  savePictures([DOG]);
});

describe('chatMediaLine', () => {
  it("says what Miya made, what of, and where it is", () => {
    expect(chatMediaLine(DOG)).toBe('Miya made a picture: a beagle in an orange pumpkin costume (Miya/2026-11-01/picture-234435-a3cd4928.png)');
    expect(chatMediaLine({ ...DOG, kind: 'video', prompt: 'a cat', path: 'Miya/v.mp4' })).toBe('Miya made a video: a cat (Miya/v.mp4)');
    expect(chatMediaLine({ ...DOG, kind: 'music', prompt: 'calm piano', path: 'Miya/m.wav' })).toBe('Miya made music: calm piano (Miya/m.wav)');
  });
});

describe('earlierPictureFor', () => {
  it('a change to the picture just shown refers back to it', () => {
    for (const text of [
      'now make the same dog wear a different custome',
      'make it blue',
      'give him a hat',
      'same dog but in the snow',
      'try a cat instead',
      'generate an image of the same dog wear a different costume',
    ]) {
      expect(earlierPictureFor(text, shown), text).toMatchObject({ path: DOG.path, prompt: DOG.prompt });
    }
  });

  it('nothing when no picture was shown in the recent chat', () => {
    expect(earlierPictureFor('now make the same dog wear a different costume', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello!' }])).toBeNull();
    expect(earlierPictureFor('make it blue', [])).toBeNull();
  });

  it('nothing when the picture named is not one Miya made here', () => {
    savePictures([]);
    expect(earlierPictureFor('make it blue', shown)).toBeNull();
  });

  it('a question about the picture is answered, not a new picture', () => {
    expect(earlierPictureFor('why is the dog orange?', shown)).toBeNull();
    expect(earlierPictureFor('what model made it?', shown)).toBeNull();
  });

  it('other work that mentions it stays other work', () => {
    expect(earlierPictureFor('research dog costumes and write a post about it', shown)).toBeNull();
    expect(earlierPictureFor('send it to Slack #general', shown)).toBeNull();
  });

  it('a new picture of something else does not start from the earlier one', () => {
    expect(earlierPictureFor('generate an image of a lighthouse at night', shown)).toBeNull();
  });

  it('a picture shown long ago in the chat is not the one meant', () => {
    const later = [...shown, ...Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `talk ${i}` }))];
    expect(earlierPictureFor('make it blue', later)).toBeNull();
  });

  it('the newest picture shown wins', () => {
    const CAT = { ...DOG, id: 'media-2', prompt: 'a grey cat', path: 'Miya/2026-11-01/picture-235033-e8aa4915.png' };
    savePictures([CAT, DOG]);
    const both = [...shown, { role: 'user', content: 'a cat now' }, { role: 'assistant', content: chatMediaLine(CAT) }];
    expect(earlierPictureFor('make it blue', both)).toMatchObject({ path: CAT.path });
  });
});
