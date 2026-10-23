// A Jose plan as boxes and arrows (owner: Q13, Q21; phase 3): one box per
// step in its agent's colour, arrows for what each step needs, and a badge
// on a step that waits for you. Used on the board and, compact, in Chat.
import React from 'react';
import { Badge } from '../ui';
import { layoutPlan, DEFAULT_BOX } from '../../services/jose/josePlanLayout';
import type { PlanStep } from '../../services/jose/stepGraph';

type MapStep = PlanStep & { status?: string; startedAtMs?: number; endedAtMs?: number };

const AGENT_NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed',
  not_run: 'Not run', waiting_approval: 'Waiting for you',
};

const COMPACT_BOX = { width: 120, height: 40, gapX: 28, gapY: 12 };
const MAX_INSTRUCTION = 110;

function elapsed(step: MapStep): string {
  if (!step.startedAtMs) return '';
  const seconds = Math.max(0, Math.round(((step.endedAtMs || Date.now()) - step.startedAtMs) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export interface JosePlanMapProps {
  steps: MapStep[];
  compact?: boolean;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
}

export function JosePlanMap({ steps, compact = false, selectedStepId, onSelectStep }: JosePlanMapProps) {
  const box = compact ? COMPACT_BOX : DEFAULT_BOX;
  const layout = layoutPlan(steps, box);
  const byId = new Map(steps.map((s) => [s.stepId, s]));
  const position = new Map(layout.nodes.map((n) => [n.stepId, n]));
  const summary = steps.map((s) => `${AGENT_NAMES[s.agent] || s.agent}: ${STATUS_LABELS[s.status || 'waiting'] || s.status}`).join(', ');

  return (
    <div className="overflow-auto max-w-full rounded-lg bg-(--surface-2) p-3" role="img" aria-label={`Plan with ${steps.length} steps. ${summary}`}>
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        <svg className="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map((edge) => {
            const from = position.get(edge.from);
            const to = position.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + box.width;
            const y1 = from.y + box.height / 2;
            const x2 = to.x;
            const y2 = to.y + box.height / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                data-testid="jose-plan-arrow"
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 4} ${y2}`}
                fill="none"
                stroke="var(--text-3)"
                strokeWidth={1.5}
                markerEnd="url(#jose-plan-arrowhead)"
              />
            );
          })}
          <defs>
            <marker id="jose-plan-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--text-3)" />
            </marker>
          </defs>
        </svg>
        {layout.nodes.map((node) => {
          const step = byId.get(node.stepId);
          if (!step) return null;
          const status = step.status || 'waiting';
          const instruction = step.instruction || '';
          const short = instruction.length > MAX_INSTRUCTION ? `${instruction.slice(0, MAX_INSTRUCTION - 1)}…` : instruction;
          const time = elapsed(step);
          return (
            <button
              key={node.stepId}
              type="button"
              data-testid="jose-plan-step"
              onClick={() => onSelectStep?.(node.stepId)}
              className={`absolute text-left rounded-md border-2 bg-(--surface-1) px-2 py-1 overflow-hidden ${selectedStepId === node.stepId ? 'ring-2 ring-(--accent)' : ''}`}
              style={{ left: node.x, top: node.y, width: box.width, height: box.height, borderColor: `var(--agent-${step.agent}, var(--border))` }}
            >
              <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-(--text-1)">
                <span>{AGENT_NAMES[step.agent] || step.agent}</span>
                {status === 'waiting_approval'
                  ? <Badge variant="warning" className="px-1! py-0! text-[9px]!">Waiting for you</Badge>
                  : <span className="text-[9px] font-normal text-(--text-3)">{STATUS_LABELS[status] || status}{time ? ` · ${time}` : ''}</span>}
              </div>
              {!compact && (
                <>
                  <div className="text-[9px] text-(--text-3) truncate">{step.actionType}</div>
                  <div className="text-[10px] leading-tight text-(--text-2) line-clamp-2" title={instruction}>{short}</div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
