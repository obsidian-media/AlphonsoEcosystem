// Draws a thumbnail's headline onto its picture, in the brand's colours.
// Lessons from the YouTube workspace (make_thumbnail.py): darken with a
// gradient behind the text, not a box; big bold type with an outline.
import type { ContentBrand } from './contentTypes';

export type HeadlineSide = 'left' | 'right' | 'center';

export interface HeadlineLayout {
  lines: string[];
  fontSize: number;
  x: number;
  y: number;
  align: HeadlineSide;
}

const MAX_SIZE = 120;
const MIN_SIZE = 56;

/** Splits text into at most `maxLines` lines no wider than `maxWidth`, or null. */
function wrap(text: string, size: number, maxWidth: number, maxLines: number, measure: (t: string, s: number) => number): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines || lines.some((line) => measure(line, size) > maxWidth)) return null;
  return lines;
}

/** Cuts text into `parts` equal pieces (used when one word is too long for any size). */
function cut(text: string, parts: number): string[] {
  const clean = text.replace(/\s+/g, '');
  const size = Math.ceil(clean.length / parts);
  return Array.from({ length: parts }, (_, i) => clean.slice(i * size, (i + 1) * size)).filter(Boolean);
}

export function layoutHeadline(
  text: string,
  opts: { width: number; height: number; layout: HeadlineSide; maxLines: number; measure: (t: string, size: number) => number },
): HeadlineLayout {
  const { width, height, layout, maxLines, measure } = opts;
  const maxWidth = width * (layout === 'center' ? 0.6 : 0.55);
  const margin = Math.round(width * 0.05);
  const place = (lines: string[], fontSize: number): HeadlineLayout => {
    const x = layout === 'center' ? width / 2 : layout === 'right' ? width - margin : margin;
    const blockHeight = lines.length * fontSize * 1.05;
    return { lines, fontSize, x, y: Math.round((height - blockHeight) / 2 + fontSize), align: layout };
  };
  for (let size = MAX_SIZE; size >= MIN_SIZE; size -= 4) {
    const lines = wrap(text.toUpperCase(), size, maxWidth, maxLines, measure);
    if (lines) return place(lines, size);
  }
  return place(cut(text.toUpperCase(), maxLines), MIN_SIZE);
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export function darkestColour(palette: string[]): string {
  const valid = palette.filter((c) => /^#?[0-9a-f]{6}$/i.test(c.trim()));
  if (valid.length === 0) return '#000000';
  return valid.reduce((dark, c) => (luminance(c) < luminance(dark) ? c : dark)).trim();
}

/** The brand's lightest colour for the text, or white when none is light enough to read. */
export function headlineColour(palette: string[]): string {
  const valid = palette.filter((c) => /^#?[0-9a-f]{6}$/i.test(c.trim()));
  const light = valid.reduce<string | null>((best, c) => (best === null || luminance(c) > luminance(best) ? c : best), null);
  return light && luminance(light) >= 0.6 ? light.trim() : '#FFFFFF';
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be loaded for the headline.'));
    img.src = `data:image/png;base64,${base64}`;
  });
}

/** Returns the finished 1280×720 thumbnail as PNG base64 (no data: prefix). */
export async function drawHeadline(baseBase64: string, headline: string, brand: Pick<ContentBrand, 'palette' | 'fonts'>, layout: HeadlineSide): Promise<string> {
  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Drawing is not available in this window.');
  const img = await loadImage(baseBase64);
  // Cover the frame without stretching.
  const scale = Math.max(width / img.width, height / img.height);
  ctx.drawImage(img, (width - img.width * scale) / 2, (height - img.height * scale) / 2, img.width * scale, img.height * scale);

  // Gradient darkening on the text side.
  const gradient = layout === 'center'
    ? ctx.createLinearGradient(0, 0, 0, height)
    : ctx.createLinearGradient(layout === 'left' ? 0 : width, 0, layout === 'left' ? width * 0.7 : width * 0.3, 0);
  gradient.addColorStop(0, 'rgba(0,0,0,0.65)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const font = brand.fonts?.trim() || 'Impact, "Arial Black", sans-serif';
  const measure = (t: string, size: number) => {
    ctx.font = `900 ${size}px ${font}`;
    return ctx.measureText(t).width;
  };
  const placed = layoutHeadline(headline, { width, height, layout, maxLines: 2, measure });
  ctx.font = `900 ${placed.fontSize}px ${font}`;
  ctx.textAlign = placed.align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, Math.round(placed.fontSize / 12));
  ctx.strokeStyle = darkestColour(brand.palette || []);
  ctx.fillStyle = headlineColour(brand.palette || []);
  placed.lines.forEach((line, i) => {
    const y = placed.y + i * placed.fontSize * 1.05;
    ctx.strokeText(line, placed.x, y);
    ctx.fillText(line, placed.x, y);
  });
  return canvas.toDataURL('image/png').split(',')[1] || '';
}
