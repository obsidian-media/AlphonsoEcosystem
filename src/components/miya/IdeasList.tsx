import React, { useState } from 'react';
import { Button } from '../ui';
import { dismissIdea, listIdeas, startProjectFromIdea } from '../../services/contentFactory/contentIdeas';
import { acceptSuggestedSlot, suggestPostTimes } from '../../services/contentFactory/postTimeSuggestions';
import type { PostPlatform } from '../../services/contentFactory/contentTypes';

const PLATFORMS: PostPlatform[] = ['youtube', 'instagram', 'facebook'];

/** Nova's follow-up ideas and the suggested posting times for a brand (phase 4a). */
export function IdeasList({ brandId, onStarted, onSlotsChanged }: { brandId: string; onStarted?(projectId: string): void; onSlotsChanged?(): void }) {
  const [, setTick] = useState(0);
  const ideas = listIdeas(brandId);
  const suggestions = PLATFORMS.flatMap((p) => suggestPostTimes(brandId, p));
  return (
    <section aria-label="Ideas" className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Ideas</div>
      {ideas.length === 0 && <p className="text-[12px] text-(--text-3)">No ideas yet: Nova suggests follow-ups when a post does well for this brand.</p>}
      {ideas.map((idea) => (
        <div key={idea.id} className="flex flex-wrap items-center gap-1 text-[12px] text-(--text-2)">
          <span>{idea.text}</span>
          <Button size="sm" variant="secondary" aria-label={`Start project: ${idea.text}`} onClick={() => {
            const project = startProjectFromIdea(idea.id);
            setTick((t) => t + 1);
            if (project) onStarted?.(project.id);
          }}>Start project</Button>
          <Button size="sm" variant="ghost" aria-label={`Dismiss idea: ${idea.text}`} onClick={() => { dismissIdea(idea.id); setTick((t) => t + 1); }}>Dismiss</Button>
        </div>
      ))}
      {suggestions.length > 0 && (
        <div className="space-y-1" aria-label="Suggested posting times">
          <div className="text-[11px] font-semibold text-(--text-2)">Suggested posting times, from your results</div>
          {suggestions.map((s) => (
            <div key={`${s.slot.platform}-${s.slot.day}-${s.slot.time}`} className="flex flex-wrap items-center gap-1 text-[12px] text-(--text-2)">
              <span>{s.reason}</span>
              <Button size="sm" variant="ghost" aria-label={`Use this slot: ${s.reason}`} onClick={() => { acceptSuggestedSlot(brandId, s.slot); onSlotsChanged?.(); setTick((t) => t + 1); }}>Use this slot</Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
