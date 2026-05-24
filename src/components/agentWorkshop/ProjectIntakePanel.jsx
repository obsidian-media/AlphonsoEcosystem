import React from 'react';

export function ProjectIntakePanel({ intake, setIntake, presets = {}, onApplyPreset }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Project Intake</div>
        <div className="flex gap-2">
          {Object.entries(presets).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => onApplyPreset?.(preset)}
              className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-200"
            >
              {preset.label || key}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" placeholder="Project name" value={intake.projectName} onChange={(e) => setIntake({ ...intake, projectName: e.target.value })} />
        <input className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" placeholder="Stack" value={intake.stack} onChange={(e) => setIntake({ ...intake, stack: e.target.value })} />
        <input className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" placeholder="Deadline" value={intake.deadline} onChange={(e) => setIntake({ ...intake, deadline: e.target.value })} />
        <select className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" value={intake.projectType} onChange={(e) => setIntake({ ...intake, projectType: e.target.value })}>
          <option value="web_app">web app</option>
          <option value="saas">SaaS</option>
          <option value="desktop_app">local desktop app</option>
          <option value="marketing_system">marketing system</option>
          <option value="automation_system">automation system</option>
          <option value="research_project">research project</option>
          <option value="content_system">content system</option>
          <option value="other">other</option>
        </select>
      </div>
      <textarea className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm min-h-20" placeholder="Project description" value={intake.projectDescription} onChange={(e) => setIntake({ ...intake, projectDescription: e.target.value })} />
      <textarea className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm min-h-16" placeholder="Target features (comma separated)" value={intake.targetFeaturesText} onChange={(e) => setIntake({ ...intake, targetFeaturesText: e.target.value })} />
      <textarea className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm min-h-16" placeholder="Constraints (comma separated)" value={intake.constraintsText} onChange={(e) => setIntake({ ...intake, constraintsText: e.target.value })} />
    </div>
  );
}

