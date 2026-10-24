import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui';
import { MOTION_CAMERA_REFUSED, MOTION_MAX_SECONDS } from '../../services/contentFactory/contentMotion';

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

type Stage = 'idle' | 'countdown' | 'recording' | 'review';

/** Records a few seconds with the webcam (phase 4c): 3-2-1, up to 10 seconds, then Keep or Again. */
export function MotionRecorder({ onKeep }: { onKeep(base64: string): Promise<void> | void }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [count, setCount] = useState(3);
  const [error, setError] = useState('');
  const [clip, setClip] = useState<Blob | null>(null);
  const streamRef = useRef<{ getTracks(): { stop(): void }[] } | null>(null);
  const recorderRef = useRef<{ stop(): void; state: string } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopCamera = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => () => { timers.current.forEach(clearTimeout); stopCamera(); }, []);

  const start = async () => {
    setError('');
    setClip(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      setError(MOTION_CAMERA_REFUSED);
      return;
    }
    streamRef.current = stream;
    setStage('countdown');
    setCount(3);
    [2, 1].forEach((n, i) => timers.current.push(setTimeout(() => setCount(n), (i + 1) * 1000)));
    timers.current.push(setTimeout(() => {
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream as MediaStream);
      recorder.ondataavailable = (e: BlobEvent) => { if (e.data) chunks.push(e.data); };
      recorder.onstop = () => { stopCamera(); setClip(new Blob(chunks, { type: 'video/webm' })); setStage('review'); };
      recorderRef.current = recorder;
      recorder.start();
      setStage('recording');
      timers.current.push(setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, MOTION_MAX_SECONDS * 1000));
    }, 3000));
  };

  return (
    <div className="space-y-1 text-[11px]">
      {stage === 'idle' && <Button size="sm" variant="secondary" onClick={() => { void start(); }}>Record</Button>}
      {stage === 'countdown' && <div className="text-lg font-bold text-(--text-1)">{count}</div>}
      {stage === 'recording' && (
        <div className="flex items-center gap-2 text-(--error)">
          Recording (up to {MOTION_MAX_SECONDS} s)…
          <Button size="sm" variant="secondary" onClick={() => recorderRef.current?.stop()}>Stop</Button>
        </div>
      )}
      {stage === 'review' && clip && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { void blobToBase64(clip).then((b64) => onKeep(b64)).then(() => setStage('idle')); }}>Keep</Button>
          <Button size="sm" variant="secondary" onClick={() => { setStage('idle'); void start(); }}>Again</Button>
        </div>
      )}
      {error && <div className="text-(--warning)">{error}</div>}
    </div>
  );
}
