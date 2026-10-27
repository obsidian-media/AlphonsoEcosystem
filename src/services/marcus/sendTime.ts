// When Marcus should send (agent roles Part C2): a time read from the request, in this computer's
// own time zone. Only a time that comes after a send word in the same sentence counts, so "write
// about the 9am meeting and post it" sends now. A time word with no day and hour ("later",
// "tomorrow") asks instead of guessing.

const SEND_WORD = /\b(send|post|share|message|remind|schedule|publish)\w*\b/i;
const UNCLEAR = /\b(later|soon|tonight|this (?:evening|afternoon|morning)|next week|sometime|in a (?:bit|while)|tomorrow|today)\b/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?';
const UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

export type SendTime = { atMs: number } | { unclear: true } | null;

function clock(hourText: string, minuteText: string | undefined, meridiem: string | undefined): { h: number; m: number } | null {
  let h = Number(hourText);
  const m = minuteText ? Number(minuteText) : 0;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  }
  return h <= 23 && m <= 59 ? { h, m } : null;
}

function onDay(base: Date, h: number, m: number): number {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  return MONTHS.findIndex((name) => name === w || name.slice(0, 3) === w.slice(0, 3) && w.length >= 3 && name.startsWith(w));
}

/** The time a request asks Marcus to send at; null means send now. */
export function readSendTime(text: string, nowMs: number): SendTime {
  const now = new Date(nowMs);
  for (const sentence of String(text || '').split(/[!?\n]+|\.(?!\d)/)) {
    const verb = SEND_WORD.exec(sentence);
    if (!verb) continue;
    const after = sentence.slice(verb.index + verb[0].length);

    const rel = /\bin\s+(\d+)\s*(minute|min|hour|hr|day)s?\b/i.exec(after);
    if (rel) {
      const unit = rel[2].toLowerCase().startsWith('min') ? 'minute' : rel[2].toLowerCase().startsWith('h') ? 'hour' : 'day';
      return { atMs: nowMs + Number(rel[1]) * UNIT_MS[unit] };
    }

    const dated = new RegExp(`\\b(?:on\\s+|for\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+([a-z]{3,})|([a-z]{3,})\\s+(\\d{1,2})(?:st|nd|rd|th)?)\\s+(?:at\\s+)?${TIME}`, 'i').exec(after);
    if (dated) {
      const day = Number(dated[1] || dated[4]);
      const month = monthIndex(dated[2] || dated[3]);
      const time = clock(dated[5], dated[6], dated[7]);
      if (month >= 0 && day >= 1 && day <= 31 && time) {
        let when = new Date(now.getFullYear(), month, day, time.h, time.m).getTime();
        if (when < nowMs) when = new Date(now.getFullYear() + 1, month, day, time.h, time.m).getTime();
        return { atMs: when };
      }
    }

    const named = new RegExp(`\\b(?:on\\s+)?(today|tomorrow|${WEEKDAYS.join('|')})\\s+(?:at\\s+)?${TIME}`, 'i').exec(after);
    if (named) {
      const time = clock(named[2], named[3], named[4]);
      if (time) {
        const word = named[1].toLowerCase();
        const base = new Date(nowMs);
        if (word === 'tomorrow') base.setDate(base.getDate() + 1);
        else if (word !== 'today') {
          const ahead = (WEEKDAYS.indexOf(word) - base.getDay() + 7) % 7;
          base.setDate(base.getDate() + ahead);
          if (ahead === 0 && onDay(base, time.h, time.m) <= nowMs) base.setDate(base.getDate() + 7);
        }
        return { atMs: onDay(base, time.h, time.m) };
      }
    }

    const plain = new RegExp(`\\bat\\s+${TIME}\\b`, 'i').exec(after);
    if (plain) {
      const time = clock(plain[1], plain[2], plain[3]);
      if (time) {
        let when = onDay(now, time.h, time.m);
        if (when <= nowMs) when = onDay(new Date(nowMs + UNIT_MS.day), time.h, time.m);
        return { atMs: when };
      }
    }

    if (UNCLEAR.test(after)) return { unclear: true };
  }
  return null;
}

/** "Tue 09:00" within six days, else "Fri 20 Nov 09:30". */
export function formatSendTime(atMs: number, nowMs: number): string {
  const d = new Date(atMs);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = DAY_NAMES[d.getDay()];
  return atMs - nowMs <= 6 * UNIT_MS.day ? `${day} ${hm}` : `${day} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${hm}`;
}
