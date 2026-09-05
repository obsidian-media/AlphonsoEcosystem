import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJsPdfSave = vi.fn();
const mockJsPdfText = vi.fn();
// Regular function expression, not an arrow function -- the real code calls
// `new jsPDF()`, and arrow functions can never be used as constructors.
const mockJsPdfConstructor = vi.fn(function MockJsPdf() {
  return {
    text: mockJsPdfText,
    save: mockJsPdfSave,
    splitTextToSize: (text: string) => [text],
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: vi.fn()
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

  it('exportHectorReportAsPowerPoint dynamically imports pptxgenjs and writes a file', async () => {
    await exportHectorReportAsPowerPoint(REPORT);
    expect(mockPptxConstructor).toHaveBeenCalled();
    expect(mockPptxWriteFile).toHaveBeenCalled();
  });
});
