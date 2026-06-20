import React from 'react';
import { Fragment } from 'react';

// ---------------------------------------------------------------------------
// Inline renderer — processes **bold**, *italic*, _italic_, `code` patterns
// within a single line of text. Returns an array of React nodes.
// ---------------------------------------------------------------------------
function renderInline(text, keyPrefix) {
  // Pattern order matters: code > bold > italic (so **bold** isn't eaten by *italic*)
  const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(INLINE);

  return parts.map((part, i) => {
    const key = `${keyPrefix}-i${i}`;

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="bg-zinc-800 px-1 rounded text-xs font-mono text-cyan-300">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    // *italic* or _italic_ — must be at least 3 chars (*x*)
    if (
      ((part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))) &&
      part.length > 2
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

// ---------------------------------------------------------------------------
// Block parser — splits the full text into logical blocks, then renders each.
// Handles: code fences, headings, bullet lists, numbered lists, paragraphs.
// ---------------------------------------------------------------------------
function parseMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Triple-backtick code block ──────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      const codeLines = [];
      i++; // skip opening fence
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      elements.push(
        <pre
          key={blockKey++}
          className="bg-zinc-900 border border-white/[0.06] rounded-lg p-3 overflow-x-auto my-2"
        >
          <code className="text-xs font-mono text-green-300">
            {codeLines.join('\n')}
          </code>
        </pre>
      );
      continue;
    }

    // ── Heading ─────────────────────────────────────────────────────────────
    const h3Match = line.match(/^### (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h1Match = line.match(/^# (.+)/);

    if (h3Match) {
      elements.push(
        <h3 key={blockKey++} className="text-[13px] font-semibold text-zinc-100 mt-3 mb-1">
          {renderInline(h3Match[1], blockKey)}
        </h3>
      );
      i++;
      continue;
    }
    if (h2Match) {
      elements.push(
        <h2 key={blockKey++} className="text-sm font-semibold text-zinc-100 mt-3 mb-1">
          {renderInline(h2Match[1], blockKey)}
        </h2>
      );
      i++;
      continue;
    }
    if (h1Match) {
      elements.push(
        <h1 key={blockKey++} className="text-sm font-bold text-zinc-100 mt-4 mb-1">
          {renderInline(h1Match[1], blockKey)}
        </h1>
      );
      i++;
      continue;
    }

    // ── Bullet list ─────────────────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ''));
        i++;
      }
      elements.push(
        <ul key={blockKey++} className="ml-4 space-y-0.5 list-disc list-outside">
          {items.map((item, idx) => (
            <li key={idx} className="text-[13px] leading-relaxed text-zinc-200">
              {renderInline(item, `${blockKey}-li${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Numbered list ────────────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={blockKey++} className="ml-4 space-y-0.5 list-decimal list-outside">
          {items.map((item, idx) => (
            <li key={idx} className="text-[13px] leading-relaxed text-zinc-200">
              {renderInline(item, `${blockKey}-oli${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Blank line — paragraph break, just skip ──────────────────────────────
    if (line.trim() === '') {
      // Only insert a gap if there's already content above and content ahead
      const hasContentAbove = elements.length > 0;
      const hasContentAhead = lines.slice(i + 1).some((l) => l.trim() !== '');
      if (hasContentAbove && hasContentAhead) {
        elements.push(<div key={blockKey++} className="h-2" />);
      }
      i++;
      continue;
    }

    // ── Plain paragraph line ─────────────────────────────────────────────────
    elements.push(
      <p key={blockKey++} className="text-[13px] leading-relaxed text-zinc-200">
        {renderInline(line, blockKey)}
      </p>
    );
    i++;
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export function MarkdownMessage({ content }) {
  return <Fragment>{parseMarkdown(content)}</Fragment>;
}
