import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, Button, Badge, StatusDot, Input, EmptyState } from '../ui';
import {
  createOutreachDraft,
  dismissOutreachCall,
  listOutreachCalls,
  runOutreachCall,
  ESTIMATED_COST_USD,
  type OutreachCallRecord
} from '../../services/calleOutreachService';
import { isCalleConfigured } from '../../services/connectors/calleConnector';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const STATUS_TO_DOT: Record<string, 'online' | 'offline' | 'pending' | 'error' | 'warning'> = {
  completed: 'online',
  failed: 'error',
  failed_to_start: 'error',
  canceled: 'offline',
  dismissed: 'offline',
  queued: 'pending',
  in_progress: 'pending',
  pending_approval: 'warning'
};

const POLICY_BLOCK_COPY: Record<string, string> = {
  zero_cost_mode: 'Blocked by Zero-Cost Mode. Change this in Settings before this call can be approved.',
  license_tier: 'This connector requires a Pro license. Upgrade in Settings.',
  needs_approval_click: ''
};

const DISMISSABLE_STATUSES = new Set(['pending_approval', 'failed_to_start', 'failed', 'canceled']);

export function CalleOutreachPanel(): React.JSX.Element {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [taskType, setTaskType] = useState<'outreach' | 'custom'>('outreach');
  const [customTask, setCustomTask] = useState('');
  const [records, setRecords] = useState<OutreachCallRecord[]>(() => listOutreachCalls());

  useEffect(() => {
    const interval = setInterval(() => setRecords(listOutreachCalls()), 5000);
    return () => clearInterval(interval);
  }, []);

  const configured = isCalleConfigured();
  const phoneValid = E164_PATTERN.test(phone);
  const hasNonTerminalForPhone = records.some(
    (r) => r.phone === phone && ['pending_approval', 'queued', 'in_progress'].includes(r.status)
  );
  const taskValid = taskType !== 'custom' || customTask.trim().length > 0;
  const canSubmit = configured && phoneValid && businessName.trim().length > 0 && taskValid && !hasNonTerminalForPhone;

  const handleSubmit = () => {
    createOutreachDraft({ businessName: businessName.trim(), phone, taskType, task: taskType === 'custom' ? customTask : '' });
    setRecords(listOutreachCalls());
    setBusinessName('');
    setPhone('');
    setCustomTask('');
  };

  const handleApprove = async (recordId: string) => {
    await runOutreachCall(recordId, { approved: true });
    setRecords(listOutreachCalls());
  };

  const handleDismiss = (recordId: string) => {
    dismissOutreachCall(recordId);
    setRecords(listOutreachCalls());
  };

  return (
    <Card>
      <CardHeader>CALL-E Outreach</CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Input aria-label="Business name" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <Input aria-label="Phone" placeholder="+15550123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {hasNonTerminalForPhone && (
            <div className="text-xs text-[--warning]">An outreach call for this number is already in progress.</div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setTaskType('outreach')} className={taskType === 'outreach' ? 'font-bold' : ''}>Outreach</button>
            <button type="button" onClick={() => setTaskType('custom')} className={taskType === 'custom' ? 'font-bold' : ''}>Custom</button>
          </div>
          {taskType === 'custom' && (
            <Input aria-label="Custom task" placeholder="Describe the call task" value={customTask} onChange={(e) => setCustomTask(e.target.value)} />
          )}
          <Button onClick={handleSubmit} disabled={!canSubmit}>Submit</Button>

          {records.length === 0 ? (
            <EmptyState title="No outreach calls yet." />
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.id} className="border border-[--border] rounded p-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={STATUS_TO_DOT[record.status] ?? 'offline'} />
                    <span>{record.businessName}</span>
                    <Badge>{record.status}</Badge>
                  </div>
                  {record.status === 'pending_approval' && record.policyBlockKind && record.policyBlockKind !== 'needs_approval_click' && (
                    <div className="text-xs text-[--warning]">{POLICY_BLOCK_COPY[record.policyBlockKind]}</div>
                  )}
                  {record.status === 'pending_approval' && (!record.policyBlockKind || record.policyBlockKind === 'needs_approval_click') && (
                    <>
                      <div className="text-xs text-[--text-3]">Calling {record.phone} — est. ${ESTIMATED_COST_USD.toFixed(2)}: "{record.task}"</div>
                      <Button onClick={() => handleApprove(record.id)}>Approve & Place Call</Button>
                    </>
                  )}
                  {DISMISSABLE_STATUSES.has(record.status) && (
                    <Button onClick={() => handleDismiss(record.id)}>Dismiss</Button>
                  )}
                  {record.summary && <p className="text-sm">{record.summary}</p>}
                  {record.structuredResult && (
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(record.structuredResult, null, 2)}</pre>
                  )}
                  {record.transcript && record.transcript.length > 0 && (
                    <div className="text-xs text-[--text-3] space-y-1">
                      {record.transcript.map((turn, index) => (
                        <div key={index}><strong>{turn.speaker}:</strong> {turn.text}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
