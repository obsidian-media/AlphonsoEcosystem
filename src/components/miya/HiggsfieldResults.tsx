import React, { useEffect, useState } from 'react';
import { allowMediaFolder, mediaUrl } from '../../services/contentFactory/contentProjectFiles';
import { checkHiggsfieldResult, listHiggsfieldResults, type HiggsfieldResult } from '../../services/contentFactory/higgsfieldByName';
import { ProjectPicture } from './ProjectPicture';

/** One Higgsfield result (phase 4b): the picture, or a player for the video, from the output folder. */
export function HiggsfieldMedia({ outputRoot, result }: { outputRoot: string; result: HiggsfieldResult }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (result.kind === 'video' && outputRoot) allowMediaFolder(outputRoot).then((ok) => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, [outputRoot, result.kind]);
  if (result.status !== 'done') return <div className="rounded-xl bg-(--surface-2) p-2 text-[11px] text-(--text-3)">Waiting for Higgsfield…</div>;
  if (result.kind === 'picture') return <ProjectPicture outputRoot={outputRoot} relativePath={result.path} alt={result.prompt} className="max-h-80 w-full" />;
  return ready
    ? <video controls preload="metadata" src={mediaUrl(outputRoot, result.path)} className="max-h-80 w-full rounded-xl bg-black" aria-label={result.prompt} />
    : <div className="rounded-xl bg-(--surface-2) p-2 text-[11px] text-(--text-3)">Loading video…</div>;
}

/** Quick package: everything asked of Higgsfield by name, newest first, with Check again for one still being made. */
export function HiggsfieldResultsList({ outputRoot }: { outputRoot: string }) {
  const [results, setResults] = useState<HiggsfieldResult[]>(() => listHiggsfieldResults());
  const [checking, setChecking] = useState<string | null>(null);
  if (results.length === 0) return null;
  const checkAgain = async (id: string) => {
    setChecking(id);
    await checkHiggsfieldResult(id).catch(() => null);
    setResults(listHiggsfieldResults());
    setChecking(null);
  };
  return (
    <section className="card space-y-3" aria-label="Made with Higgsfield">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-3)">Made with Higgsfield</div>
      <ul className="grid gap-3 md:grid-cols-2">
        {results.map((r) => (
          <li key={r.id} className="space-y-1 text-[12px]">
            <HiggsfieldMedia outputRoot={outputRoot} result={r} />
            <div className="text-(--text-2)">{r.prompt}</div>
            <div className="text-[11px] text-(--text-3)">{r.path}{typeof r.usd === 'number' ? ` · about $${r.usd.toFixed(2)}` : ''}</div>
            {r.status === 'pending' && (
              <button type="button" className="rounded-lg bg-(--surface-2) px-2 py-1" disabled={checking === r.id} onClick={() => { void checkAgain(r.id); }}>
                {checking === r.id ? 'Checking…' : 'Check again'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
