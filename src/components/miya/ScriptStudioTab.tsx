import React from 'react';
import { StepPanel } from './StepPanel';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
import type { ContentProject, StepId } from '../../services/contentFactory/contentTypes';

interface Research {
  hector?: { references?: { title: string; url: string; whyItWorks: string; hook: string }[]; patterns?: string[]; hookIdeas?: string[] };
  nova?: { competitors?: { name: string; whatTheyDo: string }[]; gaps?: string[]; opportunityScore?: number; angle?: string };
}
interface Script {
  miya?: { hooks?: string[]; chosenHook?: number; title?: string; script?: { startSec: number; endSec: number; spoken: string; onScreenText?: string; bRoll?: string; music?: string }[] };
}
interface Review {
  nova?: { hookScore?: number; scriptScore?: number; notes?: string[]; mustFix?: string[] };
  maria?: { pieces?: { pieceId: string; score: number; weakPoints?: string[] }[]; honestyIssues?: string[] };
}

export interface StepTabProps {
  project: ContentProject;
  runStep(step: StepId): void;
  chooseVersion(step: StepId, version: number): void;
  approve(step: StepId): void;
  sendBack(step: StepId, reason: string): void;
}

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Research (Hector, Nova) → hooks and timed script (Miya) → review (Nova, Maria). */
export function ScriptStudioTab({ project, runStep, chooseVersion, approve, sendBack }: StepTabProps) {
  const research = chosenVersionOf(project, 'research')?.output as Research | undefined;
  const script = (chosenVersionOf(project, 'script')?.output as Script | undefined)?.miya;
  const review = chosenVersionOf(project, 'review')?.output as Review | undefined;
  const panel = (step: StepId, children: React.ReactNode, approvals = false) => (
    <StepPanel
      project={project}
      step={step}
      onRun={() => runStep(step)}
      onChooseVersion={(v) => chooseVersion(step, v)}
      onApprove={approvals ? () => approve(step) : undefined}
      onSendBack={approvals ? (reason) => sendBack(step, reason) : undefined}
    >
      {children}
    </StepPanel>
  );

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Script Studio</h2>

      {panel('research', research && (
        <div className="grid gap-3 md:grid-cols-2 text-[12px]">
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Reference posts (Hector)</div>
            {(research.hector?.references || []).map((r) => (
              <div key={`${r.url}-${r.title}`} className="rounded-xl bg-(--surface-2) p-2">
                <div className="font-semibold text-(--text-1)">{r.title}</div>
                <div className="text-(--text-3) break-all">{r.url}</div>
                <div className="text-(--text-2)">Hook: “{r.hook}” — {r.whyItWorks}</div>
              </div>
            ))}
            {(research.hector?.patterns || []).length > 0 && (
              <ul className="list-disc pl-4 text-(--text-2)">{research.hector!.patterns!.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Market (Nova)</div>
            {research.nova?.angle && <div className="text-(--text-1)">{research.nova.angle}</div>}
            {typeof research.nova?.opportunityScore === 'number' && <div className="text-(--text-2)">Opportunity: {research.nova.opportunityScore}/100</div>}
            {(research.nova?.gaps || []).length > 0 && <ul className="list-disc pl-4 text-(--text-2)">{research.nova!.gaps!.map((g) => <li key={g}>{g}</li>)}</ul>}
          </div>
        </div>
      ))}

      {panel('script', script && (
        <div className="space-y-3 text-[12px]">
          {script.title && <div className="text-sm font-semibold text-(--text-1)">{script.title}</div>}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Hooks</div>
            {(script.hooks || []).map((hook, i) => (
              <div key={hook} data-chosen={i === script.chosenHook ? 'true' : 'false'}
                className={`rounded-lg px-2 py-1 ${i === script.chosenHook ? 'bg-(--agent-miya-glow) text-(--text-1) font-semibold' : 'bg-(--surface-2) text-(--text-2)'}`}>
                {i === script.chosenHook && <span aria-label="Chosen hook">★ </span>}<span>{hook}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase tracking-widest text-(--text-3)">
                <tr><th className="py-1 pr-2">Time</th><th className="pr-2">Spoken</th><th className="pr-2">On screen</th><th className="pr-2">B-roll</th><th>Music</th></tr>
              </thead>
              <tbody>
                {(script.script || []).map((row) => (
                  <tr key={`${row.startSec}-${row.spoken}`} className="align-top border-t border-(--border)">
                    <td className="py-1 pr-2 whitespace-nowrap text-(--text-3)">{time(row.startSec)}–{time(row.endSec)}</td>
                    <td className="pr-2 text-(--text-1)">{row.spoken}</td>
                    <td className="pr-2 text-(--text-2)">{row.onScreenText}</td>
                    <td className="pr-2 text-(--text-2)">{row.bRoll}</td>
                    <td className="text-(--text-2)">{row.music}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {panel('review', review && (
        <div className="grid gap-3 md:grid-cols-2 text-[12px]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Nova</div>
            <div className="text-(--text-1)">Hook {review.nova?.hookScore ?? '–'}/10 · Script {review.nova?.scriptScore ?? '–'}/10</div>
            {(review.nova?.mustFix || []).length > 0 && (
              <ul className="list-disc pl-4 text-(--warning)">{review.nova!.mustFix!.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
            {(review.nova?.notes || []).length > 0 && <ul className="list-disc pl-4 text-(--text-2)">{review.nova!.notes!.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Maria</div>
            {(review.maria?.pieces || []).map((p) => (
              <div key={p.pieceId} className="text-(--text-2)">{p.pieceId}: {p.score}/10{p.weakPoints?.length ? ` — ${p.weakPoints.join('; ')}` : ''}</div>
            ))}
            {(review.maria?.honestyIssues || []).length > 0 && (
              <ul className="list-disc pl-4 text-(--error)">{review.maria!.honestyIssues!.map((h) => <li key={h}>{h}</li>)}</ul>
            )}
          </div>
        </div>
      ), true)}
    </div>
  );
}
