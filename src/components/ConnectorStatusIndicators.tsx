import React from 'react';
import { memo, useEffect, useState } from 'react';
import { ZapOff } from 'lucide-react';
import { listConnectors } from '../services/connectorRegistryService';
import { deriveConnectorStatus, type StatusConnector } from '../services/connectorStatusService';

type Connector = StatusConnector;

interface ConnectorStatusDotProps {
  connectorId: string;
}

export const ConnectorStatusDot = memo(function ConnectorStatusDot({ connectorId }: ConnectorStatusDotProps) {
  const [status, setStatus] = useState('disabled');

  useEffect(() => {
    const refresh = () => {
      const connectors = listConnectors();
      const connector = connectors.find((c: Connector) => c.id === connectorId);
      setStatus(deriveConnectorStatus(connector));
    };
    refresh();
    const id = setInterval(refresh, 5000);
    const onSaved = () => refresh();
    window.addEventListener('alphonso-connector-saved', onSaved);
    return () => {
      clearInterval(id);
      window.removeEventListener('alphonso-connector-saved', onSaved);
    };
  }, [connectorId]);

  const colorMap: Record<string, string> = {
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

interface ConnectorStatusStripProps {
  zeroCostMode?: boolean;
}

export const ConnectorStatusStrip = memo(function ConnectorStatusStrip({ zeroCostMode = false }: ConnectorStatusStripProps) {
  const [connectors, setConnectors] = useState(() => listConnectors());

  useEffect(() => {
    const refresh = () => setConnectors(listConnectors());
    refresh();
    const id = setInterval(refresh, 5000);
    window.addEventListener('alphonso-connector-saved', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('alphonso-connector-saved', refresh);
    };
  }, []);

  const counts = connectors.reduce((acc: Record<string, number>, c: Connector) => {
    const s = deriveConnectorStatus(c);
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
