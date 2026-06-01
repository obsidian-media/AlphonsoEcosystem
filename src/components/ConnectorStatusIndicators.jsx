import { memo, useEffect, useState } from 'react';
import { ZapOff } from 'lucide-react';
import { listConnectors } from '../services/connectorRegistryService';

function deriveStatus(connector) {
  if (!connector) return 'disabled';
  const status = String(connector.status || '').toLowerCase();
  const requiredEnv = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  const envPresence = connector.envPresence || {};

  if (status === 'foundation_only') return 'foundation_only';

  if (status === 'configured') {
    const allEnvPresent = requiredEnv.length === 0 || requiredEnv.every((k) => Boolean(envPresence[k]));
    const testOk = connector.lastTestStatus === 'verified';
    if (allEnvPresent && testOk) return 'live';
    return 'missing_config';
  }

  if (requiredEnv.length > 0) {
    const anyPresent = requiredEnv.some((k) => Boolean(envPresence[k]));
    if (anyPresent) return 'missing_config';
  }

  return 'disabled';
}

export const ConnectorStatusDot = memo(function ConnectorStatusDot({ connectorId }) {
  const [status, setStatus] = useState('disabled');

  useEffect(() => {
    const connectors = listConnectors();
    const connector = connectors.find((c) => c.id === connectorId);
    setStatus(deriveStatus(connector));
  }, [connectorId]);

  const colorMap = {
    live: 'text-emerald-400',
    missing_config: 'text-amber-400',
    foundation_only: 'text-slate-400',
    disabled: 'text-zinc-700'
  };

  return (
    <span
      className={`text-[8px] leading-none select-none ${colorMap[status] || 'text-zinc-700'}`}
      title={`${connectorId}: ${status}`}
      aria-label={`${connectorId} status: ${status}`}
    >
      ●
    </span>
  );
});

export const ConnectorStatusStrip = memo(function ConnectorStatusStrip({ zeroCostMode = false }) {
  const [connectors, setConnectors] = useState(() => listConnectors());

  useEffect(() => {
    setConnectors(listConnectors());
  }, []);

  const counts = connectors.reduce((acc, c) => {
    const s = deriveStatus(c);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex items-center gap-3 text-[9px] font-semibold">
      {(counts.live || 0) > 0 && (
        <span className="flex items-center gap-1 text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {counts.live} live
        </span>
      )}
      {(counts.missing_config || 0) > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {counts.missing_config} missing config
        </span>
      )}
      {(counts.disabled || 0) > 0 && (
        <span className="flex items-center gap-1 text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          {counts.disabled} disabled
        </span>
      )}
      {zeroCostMode && (
        <span className="flex items-center gap-1 text-amber-500/70">
          <ZapOff className="w-2.5 h-2.5" />
          zero-cost
        </span>
      )}
    </div>
  );
});
