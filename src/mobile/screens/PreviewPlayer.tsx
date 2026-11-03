import React, { useState } from 'react';
import type { StudioData } from '../../services/phone/remoteData';
import type { MediaRef } from '../../services/phone/contentMirror';
import { previewSizeLine } from '../previewFetch';

/** A picture or video from the computer, loaded when tapped as a phone-sized preview. */
export function PreviewPlayer({ studio, mediaRef }: { studio: StudioData; mediaRef: MediaRef }) {
  const [state, setState] = useState<{ kind: 'idle' | 'loading' | 'ready' | 'failed'; url?: string; reason?: string }>({ kind: 'idle' });
  const [ask, setAsk] = useState<{ bytes: number; answer: (ok: boolean) => void } | null>(null);
  const name = mediaRef.path.split('/').pop() || mediaRef.path;

  const load = async () => {
    setState({ kind: 'loading' });
    const r = await studio.preview(mediaRef, (bytes) => new Promise<boolean>((resolve) => setAsk({ bytes, answer: resolve })));
    setAsk(null);
    setState(r.ok === false ? { kind: 'failed', reason: r.reason } : { kind: 'ready', url: r.url });
  };

  if (state.kind === 'ready' && state.url) {
    return mediaRef.kind === 'video'
      ? <video controls playsInline src={state.url} className="w-full rounded-xl bg-black" aria-label={name} />
      : <img src={state.url} alt={name} className="w-full rounded-xl" />;
  }
  return (
    <div className="rounded-xl bg-(--surface-2) p-3 text-xs">
      {ask ? (
        <div className="space-y-2">
          <p>{previewSizeLine(ask.bytes, mediaRef.kind)}</p>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg bg-(--accent) px-3 py-1 text-white" onClick={() => ask.answer(true)}>Load</button>
            <button type="button" className="rounded-lg bg-(--surface-3) px-3 py-1" onClick={() => ask.answer(false)}>Not now</button>
          </div>
        </div>
      ) : (
        <button type="button" data-testid={`studio-media-${mediaRef.path}`} disabled={state.kind === 'loading'} onClick={load} className="w-full text-left">
          {mediaRef.kind === 'video' ? 'Video' : 'Picture'} · {name}
          <span className="block text-(--text-3)">{state.kind === 'loading' ? 'Loading…' : state.kind === 'failed' ? state.reason : 'Tap to load'}</span>
        </button>
      )}
    </div>
  );
}
