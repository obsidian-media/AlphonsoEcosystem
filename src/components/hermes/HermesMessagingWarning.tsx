// Hermes gateway (2026-10-30): under a messaging connector in Settings → Connectors,
// a warning when one of the user's own Hermes profiles that an agent uses has its
// own connection to the same service. Messages there reach Hermes directly and
// skip Alphonso's approvals. Says nothing when no connected profile has it.
import React, { useEffect, useState } from 'react';
import { connectedUserProfiles, findUserProfiles, onUserProfilesChanged } from '../../services/hermes/userProfiles';

const NAMES: Record<string, string> = { telegram: 'Telegram', whatsapp: 'WhatsApp', discord: 'Discord', slack: 'Slack' };

export function HermesMessagingWarning({ platform }: { platform: string }) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const check = () => {
      const used = new Set(Object.values(connectedUserProfiles()).map((p) => p.name));
      if (!used.size) { setNames([]); return; }
      void findUserProfiles().then((profiles) => {
        if (alive) setNames(profiles.filter((p) => used.has(p.name) && p.platformsOn.includes(platform)).map((p) => p.name));
      }).catch(() => undefined);
    };
    check();
    // Connecting a profile on this same page shows the warning at once (QA, 2026-10-31).
    const stop = onUserProfilesChanged(check);
    return () => { alive = false; stop(); };
  }, [platform]);

  if (!names.length) return null;
  const service = NAMES[platform] || platform;
  return (
    <div data-testid={`hermes-messaging-warning-${platform}`} className="mt-3 rounded-xl bg-(--warning-dim) p-3 text-xs text-(--warning)">
      {`Your Hermes profile ${names.join(', ')} also has its own ${service}: messages there skip Alphonso's approvals.`}
    </div>
  );
}
