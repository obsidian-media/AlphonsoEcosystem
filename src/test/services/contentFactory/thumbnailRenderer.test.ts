import { describe, it, expect } from 'vitest';
import { layoutHeadline, darkestColour, headlineColour } from '../../../services/contentFactory/thumbnailRenderer';

const measure = (text: string, size: number) => text.length * size * 0.6;

describe('layoutHeadline', () => {
  it('fits a short headline in at most 2 lines at a large size', () => {
    const layout = layoutHeadline('THE 3 SECOND RULE', { width: 1280, height: 720, layout: 'left', maxLines: 2, measure });
    expect(layout.lines.length).toBeGreaterThanOrEqual(1);
    expect(layout.lines.length).toBeLessThanOrEqual(2);
    expect(layout.fontSize).toBeGreaterThanOrEqual(56);
    expect(layout.fontSize).toBeLessThanOrEqual(120);
    expect(layout.align).toBe('left');
    for (const line of layout.lines) expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(1280 * 0.55);
  });

  it('puts right and centre headlines on their side', () => {
    expect(layoutHeadline('BIG IDEA', { width: 1280, height: 720, layout: 'right', maxLines: 2, measure }).align).toBe('right');
    const centre = layoutHeadline('BIG IDEA', { width: 1280, height: 720, layout: 'center', maxLines: 2, measure });
    expect(centre.align).toBe('center');
    expect(centre.x).toBe(640);
  });

  it('still fits one very long word, cut over two lines, at the smallest size or more', () => {
    const layout = layoutHeadline('SUPERCALIFRAGILISTICEXPIALIDOCIOUSLY', { width: 1280, height: 720, layout: 'left', maxLines: 2, measure });
    expect(layout.fontSize).toBeGreaterThanOrEqual(56);
    expect(layout.lines.length).toBeLessThanOrEqual(2);
    expect(layout.lines.join('')).toBe('SUPERCALIFRAGILISTICEXPIALIDOCIOUSLY');
  });
});

describe('darkestColour', () => {
  it('picks the darkest brand colour for the outline, or black', () => {
    expect(darkestColour(['#F5F0E8', '#05261A', '#E4573F'])).toBe('#05261A');
    expect(darkestColour([])).toBe('#000000');
  });
});

describe('headlineColour', () => {
  it('uses the lightest brand colour when it is light enough, else white', () => {
    expect(headlineColour(['#05261A', '#F5F0E8'])).toBe('#F5F0E8');
    expect(headlineColour(['#05261A', '#0C6944'])).toBe('#FFFFFF');
    expect(headlineColour([])).toBe('#FFFFFF');
  });
});
