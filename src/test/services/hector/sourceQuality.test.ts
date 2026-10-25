// Junk results and source kinds (agent phase 1, 2026-10-25).
import { describe, it, expect } from 'vitest';
import { isJunkResult, sourceKind, rankSources } from '../../../services/hector/sourceQuality';

describe('isJunkResult', () => {
  it('drops home pages, search pages, sign-in pages and walls', () => {
    expect(isJunkResult('https://scholar.google.com/', 'Google Scholar', '')).toBe(true);
    expect(isJunkResult('https://example.com/search?q=bees', 'Search results', '')).toBe(true);
    expect(isJunkResult('https://example.com/login', 'Sign in', '')).toBe(true);
    expect(isJunkResult('https://example.org/a', 'Just a moment...', 'Enable JavaScript and cookies to continue')).toBe(true);
    expect(isJunkResult('https://example.org/a', 'ResearchGate', 'Security check required')).toBe(true);
  });

  it('keeps articles and reports', () => {
    expect(isJunkResult('https://phys.org/news/2026-09-wild-honeybee-populations.html', 'Wild honeybees endangered', 'European wild honeybees…')).toBe(false);
    expect(isJunkResult('https://coloss.org/articles/8629/', 'New IUCN Red List Status', '')).toBe(false);
  });
});

describe('sourceKind', () => {
  it('primary: government, intergovernmental, education and research papers', () => {
    for (const url of [
      'https://www.usda.gov/bees', 'https://www.gov.uk/guidance/bees', 'https://www.nhs.gov.uk/x', 'https://www.who.int/news',
      'https://www.ox.ac.uk/research/bees', 'https://www.stanford.edu/x', 'https://ec.europa.eu/food/bees',
      'https://conbio.onlinelibrary.wiley.com/doi/10.1111/csp2.1', 'https://www.sciencedirect.com/science/article/pii/S0022',
      'https://www.researchgate.net/publication/384501272_x', 'https://example.org/report-2026.pdf',
    ]) expect(sourceKind(url), url).toBe('primary');
  });

  it('news by a dated path; else general', () => {
    expect(sourceKind('https://www.bbc.com/news/2026/09/12/bees')).toBe('news');
    expect(sourceKind('https://phys.org/news/2026-09-wild-honeybee.html')).toBe('news');
    expect(sourceKind('https://worldanimalfoundation.org/advocate/bee-statistics/')).toBe('general');
  });
});

describe('rankSources', () => {
  it('primary, then news, then general, keeping the engine order within each', () => {
    const list = [
      { url: 'https://blog.example/a' }, { url: 'https://www.usda.gov/b' }, { url: 'https://news.example/2026/01/02/c' },
      { url: 'https://blog.example/d' }, { url: 'https://www.ox.ac.uk/e' },
    ];
    expect(rankSources(list).map((s) => s.url)).toEqual([
      'https://www.usda.gov/b', 'https://www.ox.ac.uk/e', 'https://news.example/2026/01/02/c', 'https://blog.example/a', 'https://blog.example/d',
    ]);
  });
});
