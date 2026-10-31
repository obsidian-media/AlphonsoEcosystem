// Hermes gateway (2026-10-30): Hermes profiles in Settings → Agents. Each agent
// can get a Hermes profile Alphonso sets up (its own key, port and model), or
// use one of the user's own Hermes profiles. Alphonso still asks before
// anything is sent, changed or run; the warnings say when a profile can act
// without asking. Plain words only: no Hermes jargon on screen.
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui';
import { SmallModelNotice } from '../SmallModelNotice';
import { listAgentProfiles } from '../../agents/agentRegistry';
import { listOwnProfiles, profileModelChoices, removeProfile, setProfileModel, setUpProfile, type ProfileInfo, type ProfileModel } from '../../services/hermes/hermesProfiles';
import { savedProfileModel } from '../../services/hermes/profileModels';
import { ENV_NOT_CHECKED, connectUserProfile, findUserProfiles, type UserProfileView } from '../../services/hermes/userProfiles';
import { setAgentProvider } from '../../services/modelSelectionService';

const modelValue = (m: { kind: string; model: string }) => `${m.kind}:${m.model}`;
const modelLabel = (m: ProfileModel) => (m.kind === 'ollama' ? m.model : 'A free OpenRouter model');

function parseModel(value: string): ProfileModel | null {
  const i = value.indexOf(':');
  const kind = value.slice(0, i);
  const model = value.slice(i + 1);
  return (kind === 'ollama' || kind === 'openrouter') && model ? { kind, model } : null;
}

interface Agent { id: string; name: string }

export function HermesProfilesSection() {
  const agents = listAgentProfiles() as Agent[];
  const [own, setOwn] = useState<ProfileInfo[]>([]);
  const [choices, setChoices] = useState<ProfileModel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [found, setFound] = useState<UserProfileView[] | null>(null);
  const [connectAgent, setConnectAgent] = useState<Record<string, string>>({});
  const [connectKey, setConnectKey] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setOwn(await listOwnProfiles());
  }, []);

  useEffect(() => {
    void refresh();
    void profileModelChoices().then(setChoices);
  }, [refresh]);

  const run = async (key: string, work: () => Promise<{ ok: boolean; reason?: string }>, done: string) => {
    setBusy(key);
    setMessage('');
    try {
      const result = await work();
      setMessage(result.ok ? done : result.reason || 'That didn’t work.');
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const find = async () => {
    setBusy('find');
    try {
      setFound(await findUserProfiles());
    } finally {
      setBusy(null);
    }
  };

  const connect = (profile: UserProfileView) => {
    const agent = connectAgent[profile.name] || agents[0]?.id;
    if (!agent) return;
    void run(`connect-${profile.name}`, async () => {
      const result = await connectUserProfile(profile.name, agent, connectKey[profile.name] || '');
      if (result.ok) setAgentProvider(agent, { provider: 'hermes' });
      return result;
    }, `${agents.find((a) => a.id === agent)?.name || agent} now uses your profile ${profile.name}.`);
  };

  return (
    <div className="space-y-3" data-testid="hermes-profiles">
      <div>
        <div className="text-sm font-semibold text-(--text-1)">Hermes profiles</div>
        <p className="text-xs text-(--text-3)">
          A Hermes profile lets an agent use Hermes&apos;s own tools. Alphonso still asks you before anything is sent, changed or run.
        </p>
      </div>
      {message && <div className="text-xs text-(--text-2)" role="status">{message}</div>}

      {agents.map((agent) => {
        const profile = own.find((p) => p.agent === agent.id);
        const saved = savedProfileModel(agent.id);
        return (
          <div key={agent.id} data-testid={`hermes-row-${agent.id}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-(--surface-2) p-3">
            <div className="text-sm font-semibold text-(--text-1) w-24 shrink-0">{agent.name}</div>
            {!profile && (
              <Button size="sm" variant="secondary" data-testid={`hermes-setup-${agent.id}`} disabled={busy !== null}
                onClick={() => void run(`setup-${agent.id}`, () => setUpProfile(agent.id), `${agent.name} now uses a Hermes profile.`)}>
                {`Set up a Hermes profile for ${agent.name}`}
              </Button>
            )}
            {profile && (
              <>
                <span data-testid={`hermes-state-${agent.id}`} className="text-xs text-(--text-2)">{profile.running ? 'Running' : 'Stopped'}</span>
                <label className="flex items-center gap-2 text-xs text-(--text-3)">
                  Thinks with
                  <select
                    data-testid={`hermes-model-${agent.id}`}
                    aria-label={`Model for ${agent.name}'s Hermes profile`}
                    className="rounded-lg bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
                    value={saved ? modelValue(saved) : ''}
                    disabled={busy !== null}
                    onChange={(e) => {
                      const model = parseModel(e.target.value);
                      if (model) void run(`model-${agent.id}`, () => setProfileModel(agent.id, model), 'Saved. It takes effect the next time the profile starts.');
                    }}
                  >
                    {!saved && <option value="">Not known</option>}
                    {saved && !choices.some((c) => modelValue(c) === modelValue(saved)) && (
                      <option value={modelValue(saved)}>{saved.kind === 'ollama' ? saved.model : 'A free OpenRouter model'}</option>
                    )}
                    {choices.map((c) => <option key={modelValue(c)} value={modelValue(c)}>{modelLabel(c)}</option>)}
                  </select>
                </label>
                {saved?.kind === 'ollama' && <SmallModelNotice model={saved.model} short />}
                {removing === agent.id ? (
                  <span className="flex items-center gap-2 text-xs text-(--text-2)">
                    {`Remove ${agent.name}'s Hermes profile? What it remembers is deleted.`}
                    <Button size="sm" variant="secondary" data-testid={`hermes-remove-confirm-${agent.id}`}
                      onClick={() => { setRemoving(null); void run(`remove-${agent.id}`, () => removeProfile(agent.id), `${agent.name}'s Hermes profile was removed.`); }}>
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Keep</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" data-testid={`hermes-remove-${agent.id}`} disabled={busy !== null} onClick={() => setRemoving(agent.id)}>
                    Remove
                  </Button>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="space-y-2">
        <Button size="sm" variant="secondary" data-testid="hermes-find" disabled={busy !== null} onClick={() => void find()}>
          Find my Hermes profiles
        </Button>
        {found && (
          <>
            <p className="text-xs text-(--text-3)">{ENV_NOT_CHECKED}</p>
            {!found.length && <p className="text-xs text-(--text-2)">No Hermes profiles found on this computer.</p>}
            {found.map((p) => (
              <div key={p.name} data-testid={`hermes-user-${p.name}`} className="space-y-2 rounded-xl bg-(--surface-2) p-3">
                <div className="flex items-center gap-2 text-sm text-(--text-1)">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-(--text-3)">{p.answering ? 'Answering' : 'Not answering'}</span>
                </div>
                {p.warnings.length > 0 && (
                  <ul data-testid={`hermes-warning-${p.name}`} className="list-disc pl-4 text-xs text-(--warning)">
                    {p.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    data-testid={`hermes-connect-agent-${p.name}`}
                    aria-label={`Agent to use ${p.name}`}
                    className="rounded-lg bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
                    value={connectAgent[p.name] || agents[0]?.id || ''}
                    onChange={(e) => setConnectAgent((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  >
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input
                    type="password"
                    data-testid={`hermes-connect-key-${p.name}`}
                    aria-label={`Key for ${p.name}`}
                    placeholder="This profile's API key"
                    autoComplete="off"
                    className="rounded-lg bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)"
                    value={connectKey[p.name] || ''}
                    onChange={(e) => setConnectKey((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  />
                  <Button size="sm" variant="secondary" data-testid={`hermes-connect-${p.name}`} disabled={busy !== null} onClick={() => connect(p)}>
                    Use for this agent
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
