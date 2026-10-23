import React, { useEffect, useState } from 'react';
import { loadProjectImage } from '../../services/contentFactory/contentProjectFiles';

/** A picture saved in the project folder, loaded through the backend. */
export function ProjectPicture({ outputRoot, relativePath, alt, className = '' }: { outputRoot: string; relativePath?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (outputRoot && relativePath) {
      loadProjectImage(outputRoot, relativePath).then((url) => { if (alive) setSrc(url); });
    }
    return () => { alive = false; };
  }, [outputRoot, relativePath]);
  if (!src) return <div className={`flex items-center justify-center rounded-xl bg-(--surface-2) text-[11px] text-(--text-3) ${className}`}>Loading picture…</div>;
  return <img src={src} alt={alt} className={`rounded-xl object-cover ${className}`} />;
}
