import React from 'react';

// 'custom' (the agent-grid, pick-components-individually path) is
// deliberately absent: that flow isn't built yet, and an earlier version
// shipped a tile promising it that silently completed Setup and installed
// nothing. Add the tile back in the same change that implements the grid.
export type IntentId = 'chat-only' | 'chat-images' | 'chat-voice' | 'full-power';

interface IntentTile {
  id: IntentId;
  label: string;
  blurb: string;
}

const INTENT_TILES: IntentTile[] = [
  { id: 'chat-only', label: 'Chat Only', blurb: 'Fastest setup, ~2GB' },
  { id: 'chat-images', label: 'Chat + Images', blurb: 'Adds Fooocus, ~15GB' },
  { id: 'chat-voice', label: 'Chat + Voice', blurb: 'Adds Voice OS, lightweight' },
  { id: 'full-power', label: 'Full Power Mode', blurb: 'Everything recommended for your hardware' },
];

export interface IntentSelectionProps {
  onSelect: (intent: IntentId) => void;
}

export function IntentSelection({ onSelect }: IntentSelectionProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text-1)]">What do you want Alphonso to do?</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">You can change this any time later.</p>
      </div>
      {/* Grouped and labelled so a screen reader announces what this set of
          buttons is for, not just four unrelated buttons in sequence. */}
      <div
        role="group"
        aria-label="What do you want Alphonso to do?"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl"
      >
        {INTENT_TILES.map((tile) => (
          <button
            key={tile.id}
            onClick={() => onSelect(tile.id)}
            // Explicit label: without it the two spans below are read as one
            // run-on string ("Chat + Images Adds Fooocus, ~15GB").
            aria-label={`${tile.label}. ${tile.blurb}.`}
            className="flex flex-col items-start gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-dim)]"
          >
            <span className="font-semibold text-[var(--text-1)]">{tile.label}</span>
            <span className="text-xs text-[var(--text-3)]">{tile.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
