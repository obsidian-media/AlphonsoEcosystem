import React, { Fragment } from 'react';

interface Props {
  content: string;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
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

function parseMarkdown(text: string): React.ReactNode[] | null {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
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

    const h3Match = line.match(/^### (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h1Match = line.match(/^# (.+)/);

    if (h3Match) {
      elements.push(
        <h3 key={blockKey++} className="text-[13px] font-semibold text-zinc-100 mt-3 mb-1">
          {renderInline(h3Match[1], String(blockKey))}
        </h3>
      );
      i++;
      continue;
    }
    if (h2Match) {
      elements.push(
        <h2 key={blockKey++} className="text-sm font-semibold text-zinc-100 mt-3 mb-1">
          {renderInline(h2Match[1], String(blockKey))}
        </h2>
      );
      i++;
      continue;
    }
    if (h1Match) {
      elements.push(
        <h1 key={blockKey++} className="text-sm font-bold text-zinc-100 mt-4 mb-1">
          {renderInline(h1Match[1], String(blockKey))}
        </h1>
      );
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
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

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
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

    if (line.trim() === '') {
      const hasContentAbove = elements.length > 0;
      const hasContentAhead = lines.slice(i + 1).some((l) => l.trim() !== '');
      if (hasContentAbove && hasContentAhead) {
        elements.push(<div key={blockKey++} className="h-2" />);
      }
      i++;
      continue;
    }

    elements.push(
      <p key={blockKey++} className="text-[13px] leading-relaxed text-zinc-200">
        {renderInline(line, String(blockKey))}
      </p>
    );
    i++;
  }

  return elements;
}

export function MarkdownMessage({ content }: Props) {
  return <Fragment>{parseMarkdown(content)}</Fragment>;
}
