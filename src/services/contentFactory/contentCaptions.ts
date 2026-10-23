// Captions for the finished video (Miya content factory phase 2a). The words
// always come from the script; Whisper, run on the voice track, only gives
// the timing. A misheard word keeps the script's spelling, a word Whisper
// missed gets a time between its neighbours, and a word Whisper added is left
// out. Written as SRT, which ffmpeg burns in from a file (never inline text).
export interface TimedWord { word: string; start: number; end: number }

const LOOK_AHEAD = 3;
const PAUSE_SECONDS = 1;

const norm = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export function alignCaptions(scriptWords: string[], heard: TimedWord[]): TimedWord[] {
  const times: ({ start: number; end: number } | null)[] = [];
  let h = 0;
  for (let i = 0; i < scriptWords.length; i += 1) {
    const want = norm(scriptWords[i]);
    let found = -1;
    for (let j = h; j < Math.min(heard.length, h + LOOK_AHEAD + 1); j += 1) {
      if (norm(heard[j].word) === want) { found = j; break; }
    }
    if (found >= 0) {
      times.push({ start: heard[found].start, end: heard[found].end });
      h = found + 1;
      continue;
    }
    // Misheard: the next script word matches the heard word after this one,
    // or this is the last script word and something is left to hear.
    const next = scriptWords[i + 1];
    const substitution = h < heard.length && (next === undefined
      ? true
      : h + 1 < heard.length && norm(heard[h + 1].word) === norm(next));
    if (substitution) {
      times.push({ start: heard[h].start, end: heard[h].end });
      h += 1;
    } else {
      times.push(null);
    }
  }
  // Words with no time share the gap between their neighbours.
  const out: TimedWord[] = [];
  for (let i = 0; i < scriptWords.length; i += 1) {
    const t = times[i];
    if (t) { out.push({ word: scriptWords[i], ...t }); continue; }
    let k = i;
    while (k < scriptWords.length && !times[k]) k += 1;
    const from = out.length ? out[out.length - 1].end : 0;
    const to = k < scriptWords.length ? Math.max(from, times[k]!.start) : from + 0.3 * (k - i);
    const step = (to - from) / (k - i);
    for (let m = i; m < k; m += 1) {
      const start = from + step * (m - i);
      out.push({ word: scriptWords[m], start, end: start + step });
    }
    i = k - 1;
  }
  return out;
}

/** Without Whisper: each line's words spread evenly over the line's time. */
export function captionsFromLines(lines: { text: string; start: number; end: number }[]): TimedWord[] {
  return lines.flatMap((line) => {
    const words = line.text.split(/\s+/).filter(Boolean);
    const step = words.length ? (line.end - line.start) / words.length : 0;
    return words.map((word, i) => ({ word, start: line.start + step * i, end: line.start + step * (i + 1) }));
  });
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(words: TimedWord[], options: { maxWords: number; maxSeconds: number }): string {
  const groups: TimedWord[][] = [];
  for (const word of words) {
    const group = groups[groups.length - 1];
    const startsNew = !group
      || group.length >= options.maxWords
      || word.end - group[0].start > options.maxSeconds
      || word.start - group[group.length - 1].end > PAUSE_SECONDS;
    if (startsNew) groups.push([word]); else group.push(word);
  }
  return groups
    .map((group, i) => {
      const text = group.map((w) => w.word.replace(/\s+/g, ' ').trim()).join(' ');
      return `${i + 1}\n${srtTime(group[0].start)} --> ${srtTime(group[group.length - 1].end)}\n${text}\n`;
    })
    .join('\n');
}
