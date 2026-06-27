import React, { useEffect, useState } from 'react';
import { getOpportunityHistory } from '../services/novaAnalysisService';

interface OpportunityHistoryEntry {
  score: number;
  recommendation: string;
}

export function NovaHistoryChart() {
  const [history, setHistory] = useState<OpportunityHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getOpportunityHistory());
  }, []);

  const points = history.slice(-10);
  const count = history.length;
  const latest = history.length > 0 ? history[history.length - 1] : null;

  const WIDTH = 300;
  const HEIGHT = 48;
  const PADDING_TOP = 4;
  const PADDING_BOTTOM = 4;
  const USABLE_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const toX = (i: number, total: number) => total <= 1 ? WIDTH / 2 : (i / (total - 1)) * WIDTH;
  const toY = (score: number) => PADDING_TOP + USABLE_HEIGHT - (Math.min(100, Math.max(0, score)) / 100) * USABLE_HEIGHT;

  const polylinePoints = points.length >= 2
    ? points.map((p, i) => `${toX(i, points.length)},${toY(p.score)}`).join(' ')
    : '';

  return (
    <div className="space-y-3">
      {points.length < 2 ? (
        <div className="flex items-center justify-center h-12 rounded-xl bg-zinc-900/50 border border-white/[0.04]">
          <span className="text-xs text-zinc-500">Not enough data yet</span>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          aria-label="Nova opportunity score history sparkline"
          className="rounded-xl overflow-visible"
        >
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={toX(i, points.length)}
              cy={toY(p.score)}
              r="2.5"
              fill="#6366f1"
            />
          ))}
        </svg>
      )}

      {latest && (
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <span className="text-3xl font-bold text-indigo-400 leading-none">{latest.score}</span>
            <span className="text-xs text-zinc-500 ml-1">/ 100</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed flex-1 truncate" title={latest.recommendation}>
            {latest.recommendation
              ? latest.recommendation.length > 120
                ? latest.recommendation.slice(0, 117) + '...'
                : latest.recommendation
              : 'No recommendation available'}
          </p>
        </div>
      )}

      <p className="text-[11px] text-zinc-500">
        last {count} opportunit{count === 1 ? 'y' : 'ies'} analyzed
      </p>
    </div>
  );
}
