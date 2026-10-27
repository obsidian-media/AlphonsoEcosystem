import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJsPdfSave = vi.fn();
const mockJsPdfText = vi.fn();
const mockJsPdfAddPage = vi.fn();
const CHARS_PER_MOCK_LINE = 20;
// Regular function expression, not an arrow function -- the real code calls
// `new jsPDF()`, and arrow functions can never be used as constructors.
const mockJsPdfConstructor = vi.fn(function MockJsPdf() {
  return {
    text: mockJsPdfText,
    save: mockJsPdfSave,
    // Real splitTextToSize wraps to the page width; this mock simulates that
    // by chunking into fixed-length "lines" so a long enough report actually
    // produces more lines than fit on one page, exercising pagination.
    splitTextToSize: (text: string) => {
      const lines: string[] = [];
      for (let i = 0; i < text.length; i += CHARS_PER_MOCK_LINE) {
        lines.push(text.slice(i, i + CHARS_PER_MOCK_LINE));
      }
      return lines.length ? lines : [text];
    },
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: mockJsPdfAddPage
  };
});
vi.mock('jspdf', () => ({ jsPDF: mockJsPdfConstructor }));

const mockPptxWriteFile = vi.fn();
const mockPptxAddText = vi.fn();
const mockPptxAddSlide = vi.fn(() => ({ addText: mockPptxAddText }));
const mockPptxConstructor = vi.fn(function MockPptxGenJS() {
  return {
    addSlide: mockPptxAddSlide,
    writeFile: mockPptxWriteFile
  };
});
vi.mock('pptxgenjs', () => ({ default: mockPptxConstructor }));

vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock-url'), revokeObjectURL: vi.fn() });

import {
  buildHectorReportMarkdown,
  exportHectorReportAsMarkdown,
  exportHectorReportAsPdf,
  exportHectorReportAsPowerPoint
} from '../services/hectorExportService';

const REPORT = {
  researchQuestion: 'How does React 19 Suspense work?',
  status: 'sources_verified',
  confidenceLevel: 'verified',
  synthesis: {
    overview: 'React 19 Suspense is stable.',
    keyFindings: ['Core API unchanged', 'No migration tooling found'],
    disagreements: ['Source A and B disagree on streaming behavior'],
    gaps: ['No coverage of server components']
  },
  sourceProofs: [
    { url: 'https://a.example.com', title: 'Source A', ok: true, httpStatus: 200 },
    { url: 'https://b.example.com', title: 'Source B', ok: true, httpStatus: 200 }
  ]
};

describe('buildHectorReportMarkdown', () => {
  it('always includes all four synthesis sections regardless of any "selected view"', () => {
    const md = buildHectorReportMarkdown(REPORT);
    expect(md).toContain('React 19 Suspense is stable.');
    expect(md).toContain('Core API unchanged');
    expect(md).toContain('Source A and B disagree on streaming behavior');
    expect(md).toContain('No coverage of server components');
  });

  it('includes source citations', () => {
    const md = buildHectorReportMarkdown(REPORT);
    expect(md).toContain('https://a.example.com');
    expect(md).toContain('https://b.example.com');
  });

  it('falls back gracefully when synthesis is absent', () => {
    const md = buildHectorReportMarkdown({ ...REPORT, synthesis: undefined, summary: 'Old-style summary.' });
    expect(md).toContain('Old-style summary.');
  });
});

describe('export functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportHectorReportAsMarkdown creates a downloadable blob', () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    exportHectorReportAsMarkdown(REPORT);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exportHectorReportAsPdf dynamically imports jspdf and saves a file', async () => {
    await exportHectorReportAsPdf(REPORT);
    expect(mockJsPdfConstructor).toHaveBeenCalled();
    expect(mockJsPdfSave).toHaveBeenCalled();
  });

  it('exportHectorReportAsPdf adds extra pages instead of running long content off the bottom of one page', async () => {
    const LONG_REPORT = {
      ...REPORT,
      synthesis: {
        ...REPORT.synthesis,
        keyFindings: Array.from({ length: 60 }, (_, i) => `Finding number ${i} with enough text to wrap across multiple simulated lines.`)
      }
    };
    await exportHectorReportAsPdf(LONG_REPORT);
    expect(mockJsPdfAddPage).toHaveBeenCalled();
  });

  it('exportHectorReportAsPowerPoint dynamically imports pptxgenjs and writes a file', async () => {
    await exportHectorReportAsPowerPoint(REPORT);
    expect(mockPptxConstructor).toHaveBeenCalled();
    expect(mockPptxWriteFile).toHaveBeenCalled();
  });

  it('exportHectorReportAsPowerPoint gives every body text box explicit sizing and shrink-to-fit so long text is not clipped', async () => {
    await exportHectorReportAsPowerPoint(REPORT);
    const bodyCalls = mockPptxAddText.mock.calls.filter(([, opts]) => (opts as { fontSize?: number })?.fontSize !== 20 && (opts as { fontSize?: number })?.fontSize !== 18);
    expect(bodyCalls.length).toBeGreaterThan(0);
    for (const [, opts] of bodyCalls) {
      const options = opts as { w?: number; h?: number; fit?: string };
      expect(options.w).toBeGreaterThan(0);
      expect(options.h).toBeGreaterThan(0);
      expect(options.fit).toBe('shrink');
    }
  });

  // Agent roles Part C2: a report made since agent phase 1 gets its answer, cited findings and labelled sources.
  it("exportHectorReportAsPowerPoint shows a newer report's answer, its cited parts and its labelled sources", async () => {
    mockPptxAddText.mockClear();
    const research = {
      question: 'How many bee colonies?', answer: 'About 17 million [1].',
      subQuestions: [{ question: 'How many?', findings: [{ text: 'About 17 million', sources: [1], support: 'one source' }] }],
      disagreements: [], notFound: [],
      sources: [{ n: 1, title: 'EU bees', url: 'https://ec.europa.eu/bees', label: 'read' }, { n: 2, title: 'Blog', url: 'https://b.example', label: 'snippet' }],
    };
    await exportHectorReportAsPowerPoint({ ...REPORT, research } as never);
    const texts = mockPptxAddText.mock.calls.map(([t]) => String(t)).join('\n');
    expect(texts).toContain('About 17 million [1].');
    expect(texts).toContain('About 17 million [1] (one source)');
    expect(texts).toContain('[1] EU bees — https://ec.europa.eu/bees (Read)');
    expect(texts).toContain('[2] Blog — https://b.example (Snippet only)');
  });
});
