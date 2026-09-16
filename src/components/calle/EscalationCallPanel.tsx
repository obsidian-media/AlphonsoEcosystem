import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, Button, Badge, StatusDot, Input, EmptyState } from '../ui';
import {
  getEscalationSettings,
  saveEscalationSettings,
  listEscalationCallRecords,
  runEscalationCheck,
  type EscalationCallRecord
} from '../../services/escalationCallService';
import { isCalleConfigured } from '../../services/connectors/calleConnector';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const STATUS_TO_DOT: Record<string, 'online' | 'offline' | 'pending' | 'error' | 'warning'> = {
  resolved: 'online',
  failed: 'error',
  in_progress: 'pending',
  placing: 'pending'
};

export function EscalationCallPanel(): React.JSX.Element {
  const [settings, setSettings] = useState(() => getEscalationSettings());
  const [records, setRecords] = useState<EscalationCallRecord[]>(() => listEscalationCallRecords());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setRecords(listEscalationCallRecords()), 5000);
    return () => clearInterval(interval);
  }, []);

  const configured = isCalleConfigured();
  const phoneValid = settings.phoneNumber.trim().length === 0 || E164_PATTERN.test(settings.phoneNumber);

  const update = (next: Partial<typeof settings>) => {
    const saved = saveEscalationSettings(next);
    setSettings(saved);
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await runEscalationCheck();
    } finally {
      setRecords(listEscalationCallRecords());
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>Escalation Calls</CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-xs text-[--text-3]">
            When a decision has been waiting for approval past the threshold below with no response
            through the app or messaging channels, Alphonso places one real phone call to ask for a
            verbal approve/reject. Requires CALL-E to be configured above and Zero-Cost Mode off.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update({ enabled: !settings.enabled })}
              className={settings.enabled ? 'font-bold' : ''}
            >
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <Input
            aria-label="Escalation phone number"
            placeholder="+15550123456"
            value={settings.phoneNumber}
            onChange={(e) => update({ phoneNumber: e.target.value })}
          />
          {!phoneValid && <div className="text-xs text-[--warning]">Enter a valid E.164 number, e.g. +15550123456.</div>}
          <label className="text-xs text-[--text-3] flex items-center gap-2">
            Escalate after (minutes)
            <Input
              aria-label="Escalation threshold minutes"
              type="number"
              min={1}
              value={String(settings.thresholdMinutes)}
              onChange={(e) => update({ thresholdMinutes: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20"
            />
          </label>
          {settings.enabled && !configured && (
            <div className="text-xs text-[--warning]">CALL-E is not configured yet — add an API key above.</div>
          )}
          <Button onClick={handleCheckNow} disabled={checking || !settings.enabled}>
            {checking ? 'Checking…' : 'Check now'}
          </Button>

          {records.length === 0 ? (
            <EmptyState title="No escalation calls yet." />
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.packetId} className="border border-[--border] rounded p-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={STATUS_TO_DOT[record.status] ?? 'offline'} />
                    <span className="text-xs text-[--text-3]">packet {record.packetId}</span>
                    <Badge>{record.status}</Badge>
                    {record.decision && <Badge>{record.decision}</Badge>}
                  </div>
                  {record.note && <p className="text-sm">{record.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
