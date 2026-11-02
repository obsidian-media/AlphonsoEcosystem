// Skills on the phone (phase 3 part B, owner 2026-11-02): each agent's skills with what they're for and
// how they've done, and skill files the computer refused, with why. Writing skills stays on the computer.
import React, { useEffect, useState } from 'react';
import type { MoreData } from '../../services/phone/remoteData';
import { AGENT_NAMES, agentName } from '../../services/jose/agentNames';

export function SkillsScreen({ more }: { more: MoreData }) {
  const [data, setData] = useState(more.skills());
  useEffect(() => more.subscribe(() => setData(more.skills())), [more]);
  const agents = Object.keys(AGENT_NAMES).filter((id) => data.skills.some((s) => s.agent === id));
  return (
    <div className="space-y-4 pt-2 text-sm" data-testid="mobile-skills">
      {data.skills.length === 0 && <p className="text-xs text-(--text-3)">No skills yet.</p>}
      {agents.map((id) => (
        <section key={id}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--text-3)">{agentName(id)}</h2>
          <ul className="space-y-2">
            {data.skills.filter((s) => s.agent === id).map((s) => (
              <li key={`${s.agent}/${s.name}`} className="rounded-xl bg-(--surface-2) p-3">
                <span className="block font-medium">{s.name}</span>
                {!s.builtIn && <span className="block text-xs text-(--text-3)">Yours</span>}
                <span className="block text-xs text-(--text-2)">{s.useWhen}</span>
                <span className="block text-xs text-(--text-3)">{s.stats}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data.refused.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--text-3)">Not used</h2>
          <ul className="space-y-2">
            {data.refused.map((r) => (
              <li key={r.file} className="rounded-xl bg-(--surface-2) p-3 text-xs">
                <span className="block font-medium">{r.file}</span>
                <span className="block">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
