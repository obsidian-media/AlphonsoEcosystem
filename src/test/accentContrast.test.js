// 2.11.0 QA (owner, 2026-11-01): "make sure the new accent colours are accessible". Every accent,
// in dark and light, must reach WCAG AA (4.5:1) as text on every surface, and the text on an
// accent button (--accent-contrast) must reach 4.5:1 on the accent. Read from tokens.css itself.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf8');

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`no block ${selectorStart}`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}
function token(body, name) {
  const m = body.match(new RegExp(String.raw`--${name}:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)`));
  return m ? [Number(m[1]) / 100, Number(m[2]), Number(m[3])] : null;
}
function linear([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((x) => Math.min(1, Math.max(0, x)));
}
const luminance = (c) => { const [r, g, b] = linear(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

const dark = block(':root {');
const light = block('[data-theme="light"],');
const surfaces = (body) => ['surface-0', 'surface-1', 'surface-2', 'surface-3'].map((n) => token(body, n));
const contrastIn = (body, fallback) => token(body, 'accent-contrast') || token(fallback, 'accent-contrast');

const accents = {
  cyan: { dark: token(dark, 'accent'), light: token(light, 'accent') },
  green: { dark: token(block('[data-accent="green"] {'), 'accent'), light: token(block('.light[data-accent="green"] {'), 'accent') },
  purple: { dark: token(block('[data-accent="purple"] {'), 'accent'), light: token(block('.light[data-accent="purple"] {'), 'accent') },
  gold: { dark: token(block('[data-accent="gold"] {'), 'accent'), light: token(block('.light[data-accent="gold"] {'), 'accent') },
};

describe('accent colours are readable (WCAG AA)', () => {
  for (const [name, modes] of Object.entries(accents)) {
    it(`${name}: as text on every surface and under button text, dark and light`, () => {
      for (const [mode, body] of [['dark', dark], ['light', light]]) {
        const accent = modes[mode];
        expect(accent, `${name} ${mode}`).not.toBeNull();
        for (const surface of surfaces(body)) expect(ratio(accent, surface), `${name} ${mode} text`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(contrastIn(body, dark), accent), `${name} ${mode} button text`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
