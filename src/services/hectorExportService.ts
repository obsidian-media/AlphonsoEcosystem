interface SourceProof {
  url: string;
  title?: string;
  ok?: boolean;
  httpStatus?: number;
}

interface HectorSynthesis {
  overview: string;
  keyFindings: string[];
  disagreements: string[];
  gaps: string[];
}

interface HectorReport {
  researchQuestion?: string;
  status?: string;
  confidenceLevel?: string;
  summary?: string;
  synthesis?: HectorSynthesis;
  sourceProofs?: SourceProof[];
}

function safeFileBaseName(report: HectorReport): string {
  return String(report.researchQuestion ?? 'report').slice(0, 40).replace(/[^a-z0-9]/gi, '-');
}

export function buildHectorReportMarkdown(report: HectorReport): string {
  const sources = Array.isArray(report.sourceProofs) ? report.sourceProofs : [];
  const s = report.synthesis;
  const lines = [
    '# Hector Research Report', '',
    `**Question:** ${String(report.researchQuestion ?? 'Untitled')}`,
    `**Status:** ${String(report.status ?? 'unknown')} | **Confidence:** ${String(report.confidenceLevel ?? 'unknown')}`,
    `**Exported:** ${new Date().toISOString()}`, ''
  ];

  if (s) {
    lines.push('## Overview', '', s.overview, '');
    if (s.keyFindings.length) {
      lines.push('## Key Findings', '', ...s.keyFindings.map((f) => `- ${f}`), '');
    }
    if (s.disagreements.length) {
      lines.push('## Disagreements', '', ...s.disagreements.map((d) => `- ${d}`), '');
    }
    if (s.gaps.length) {
      lines.push('## Gaps', '', ...s.gaps.map((g) => `- ${g}`), '');
    }
  } else {
    lines.push('## Summary', '', String(report.summary ?? '_No summary yet._'), '');
  }

  lines.push(`## Sources (${sources.length})`, '');
  sources.forEach((src, i) => {
    lines.push(`${i + 1}. ${src.title ?? src.url}${src.httpStatus ? ` (HTTP ${src.httpStatus})` : ''}`);
    lines.push(`   ${src.url}`);
  });

  return lines.join('\n');
}

export function exportHectorReportAsMarkdown(report: HectorReport): void {
  const content = buildHectorReportMarkdown(report);
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hector-report-${safeFileBaseName(report)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportHectorReportAsPdf(report: HectorReport): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const content = buildHectorReportMarkdown(report);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lines: string[] = doc.splitTextToSize(content, pageWidth - 20);

  // doc.text() never auto-paginates -- passing the full line array in one call
  // would silently run content off the bottom of the page for any report
  // longer than a single page (the common case: overview + findings +
  // disagreements + gaps + full source list). Walk lines manually and add a
  // page whenever the next line would clear the bottom margin.
  const lineHeight = 7;
  const marginTop = 10;
  const marginBottom = 10;
  let y = marginTop;
  for (const line of lines) {
    if (y + lineHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(line, 10, y);
    y += lineHeight;
  }

  doc.save(`hector-report-${safeFileBaseName(report)}.pdf`);
}

export async function exportHectorReportAsPowerPoint(report: HectorReport): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  const s = report.synthesis;

  // Every body text box below gets an explicit w/h covering nearly the full
  // slide, plus `fit: 'shrink'` -- without a bounding box, pptxgenjs doesn't
  // wrap or paginate long text across slides, so variable-length synthesis
  // content (a long overview, many key findings) would silently overflow or
  // clip. Shrink-to-fit keeps everything visible on one slide per section
  // rather than attempting full multi-slide pagination, which is
  // disproportionate effort for what's meant to be a compact export.
  const bodyBox = { x: 0.5, w: 9, h: 5.5, fit: 'shrink' as const };

  const overviewSlide = pptx.addSlide();
  overviewSlide.addText(String(report.researchQuestion ?? 'Hector Research Report'), { x: 0.5, y: 0.3, fontSize: 20, bold: true });
  overviewSlide.addText(s?.overview ?? report.summary ?? '', { ...bodyBox, y: 1.2, fontSize: 14 });

  if (s?.keyFindings.length) {
    const findingsSlide = pptx.addSlide();
    findingsSlide.addText('Key Findings', { x: 0.5, y: 0.3, fontSize: 18, bold: true });
    findingsSlide.addText(s.keyFindings.map((f) => `• ${f}`).join('\n'), { ...bodyBox, y: 1, fontSize: 12 });
  }

  if (s?.disagreements.length || s?.gaps.length) {
    const notesSlide = pptx.addSlide();
    notesSlide.addText('Disagreements & Gaps', { x: 0.5, y: 0.3, fontSize: 18, bold: true });
    const body = [...(s.disagreements ?? []), ...(s.gaps ?? [])].map((x) => `• ${x}`).join('\n');
    notesSlide.addText(body, { ...bodyBox, y: 1, fontSize: 12 });
  }

  await pptx.writeFile({ fileName: `hector-report-${safeFileBaseName(report)}.pptx` });
}
