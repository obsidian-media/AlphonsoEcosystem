import React from 'react';
import {
  Activity,
  BellRing,
  Bot,
  Clapperboard,
  Cloud,
  Compass,
  Crown,
  LibraryBig,
  Eye,
  Gauge,
  Moon,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

const agents = [
  { id: 'jose', label: 'Jose', tab: 'orchestrator', icon: Crown, color: 'amber', caption: 'Orchestrator' },
  { id: 'alphonso', label: 'Alphonso', tab: 'operator', icon: Bot, color: 'cyan', caption: 'Operator' },
  { id: 'miya', label: 'Miya', tab: 'miya', icon: Clapperboard, color: 'fuchsia', caption: 'Creator' },
  { id: 'hector', label: 'Hector', tab: 'hector', icon: Cloud, color: 'teal', caption: 'Research' },
  { id: 'maria', label: 'Maria', tab: 'ecosystem', icon: ShieldCheck, color: 'amber', caption: 'Governance' },
  { id: 'marcus', label: 'Marcus', tab: 'orchestrator', icon: BellRing, color: 'cyan', caption: 'Execution' },
  { id: 'echo', label: 'Echo', tab: 'ecosystem', icon: LibraryBig, color: 'fuchsia', caption: 'Memory' },
  { id: 'sentinel', label: 'Sentinel', tab: 'orchestrator', icon: ShieldAlert, color: 'teal', caption: 'Security' },
  { id: 'nova', label: 'Nova', tab: 'ecosystem', icon: Compass, color: 'cyan', caption: 'Opportunity' }
];

const focusModes = [
  { id: 'mission_control', label: 'Mission', icon: Crown },
  { id: 'developer', label: 'Developer', icon: Activity },
  { id: 'creative', label: 'Creative', icon: Palette },
  { id: 'research', label: 'Research', icon: Eye },
  { id: 'silent', label: 'Silent', icon: Moon },
  { id: 'presentation', label: 'Present', icon: Bot }
];

const themes = [
  { id: 'deep_space', label: 'Deep Space' },
  { id: 'neon_studio', label: 'Studio' },
  { id: 'orchestrator_gold', label: 'Gold' },
  { id: 'minimal_runtime', label: 'Minimal' }
];

export function CommandRib({
  activeTab,
  setActiveTab,
  settings,
  setSettings,
  ollamaStatus,
  operatorMode
}) {
  const currentFocus = settings.focusMode || 'mission_control';
  const currentTheme = settings.environmentTheme || 'deep_space';

  return (
    <section className="border-b border-white/[0.06] bg-zinc-950/90 px-3 py-2">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          <div className="mr-1.5 hidden items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
            Command Rib
          </div>
          {agents.map((agent) => {
            const active = activeTab === agent.tab;
            return (
              <button
                key={agent.id}
                onClick={() => setActiveTab(agent.tab)}
                className={`group flex items-center gap-1 rounded-md border px-1.5 py-1 text-left transition ${
                  active
                    ? colorClass(agent.color, 'active')
                    : 'border-white/10 bg-zinc-900/45 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                }`}
              >
                <AgentAvatar
                  agentId={agent.id}
                  name={agent.label}
                  sizeClass="h-4 w-4"
                  className={active ? '' : 'opacity-90'}
                />
                <span className="leading-tight">
                  <span className="block text-[10px] font-semibold">{agent.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
          <SegmentedControl
            icon={Gauge}
            label="Focus"
            value={currentFocus}
            options={focusModes}
            onChange={(focusMode) => setSettings({ ...settings, focusMode })}
          />
          <ThemePicker
            value={currentTheme}
            onChange={(environmentTheme) => setSettings({ ...settings, environmentTheme })}
          />
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/45 px-2 py-1">
            <StatusDot state={ollamaStatus.state} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{ollamaStatus.label}</span>
          </div>
          {operatorMode && (
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/55 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-300">
              <ShieldCheck className="h-2.5 w-2.5" />
              Operator Telemetry
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SegmentedControl({ icon: Icon, label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/45 p-1">
      <div className="hidden items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500 sm:flex">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {options.map((option) => {
        const OptionIcon = option.icon;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-1 rounded-md px-1 py-1 text-[9px] font-semibold transition ${
              value === option.id ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
            }`}
          >
            <OptionIcon className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemePicker({ value, onChange }) {
  return (
    <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/45 px-2 py-1">
      <Eye className="h-3 w-3 text-zinc-500" />
      <span className="hidden text-[9px] font-bold uppercase tracking-widest text-zinc-500 sm:inline">Theme</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-[10px] font-semibold text-zinc-200 outline-none"
      >
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id} className="bg-zinc-950">
            {theme.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusDot({ state }) {
  const cls = state === 'connected' ? 'bg-emerald-400' : state === 'connecting' ? 'bg-blue-400' : 'bg-red-400';
  return <span className={`h-2 w-2 rounded-full ${cls}`} />;
}

function colorClass(color, mode) {
  if (mode !== 'active') return '';
  if (color === 'amber') return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  if (color === 'fuchsia') return 'border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100';
  if (color === 'teal') return 'border-teal-300/20 bg-teal-500/10 text-teal-100';
  return 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100';
}
