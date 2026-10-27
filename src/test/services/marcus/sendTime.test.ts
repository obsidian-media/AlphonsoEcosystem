// Agent roles Part C2: a send can have a time, read from the request in the computer's own time zone.
import { describe, it, expect } from 'vitest';
import { readSendTime, formatSendTime } from '../../../services/marcus/sendTime';

const NOW = new Date(2026, 10, 2, 10, 0).getTime(); // Monday 2 November 2026, 10:00
const at = (y: number, m: number, d: number, h: number, min = 0) => ({ atMs: new Date(y, m, d, h, min).getTime() });

describe('readSendTime', () => {
  it.each([
    ['Write a note and post it to Slack #team tomorrow at 9', at(2026, 10, 3, 9)],
    ['send it on Friday at 14:00', at(2026, 10, 6, 14)],
    ['Send it to the team in 2 hours', at(2026, 10, 2, 12)],
    ['send it in 30 minutes', at(2026, 10, 2, 10, 30)],
    ['send it at 9am', at(2026, 10, 3, 9)],
    ['send it at 4:30pm', at(2026, 10, 2, 16, 30)],
    ['Remind the team on Monday at 8', at(2026, 10, 9, 8)],
    ['post it today at 18:15', at(2026, 10, 2, 18, 15)],
    ['schedule it for 3 December at 10', at(2026, 11, 3, 10)],
    ['send it on November 20 at 9:30', at(2026, 10, 20, 9, 30)],
  ])('%s', (text, expected) => {
    expect(readSendTime(text, NOW)).toEqual(expected);
  });

  it('a time without a day or hour asks', () => {
    for (const text of ['send it later', 'post it tonight', 'send it next week', 'send it tomorrow']) {
      expect(readSendTime(text, NOW), text).toEqual({ unclear: true });
    }
  });

  it('a clock time that is not about sending means now', () => {
    expect(readSendTime('Write about the 9am meeting and post it to Slack #news', NOW)).toBeNull();
    expect(readSendTime('Post the meeting notes to Slack', NOW)).toBeNull();
  });
});

describe('formatSendTime', () => {
  it('says the weekday and time this week, and the date further out', () => {
    expect(formatSendTime(at(2026, 10, 3, 9).atMs, NOW)).toBe('Tue 09:00');
    expect(formatSendTime(at(2026, 10, 20, 9, 30).atMs, NOW)).toBe('Fri 20 Nov 09:30');
  });
});
