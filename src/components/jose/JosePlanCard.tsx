// A plan waiting for you, in Chat (phase 3): the plan as a small map, how
// Jose planned it, and Run / Edit on the board / Cancel. The board offers the
// same actions; whichever is used first counts, and a plan runs only once.
import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { JosePlanMap } from './JosePlanMap';
import { requestPlanLabel } from './JoseRequestsBoard';
import { getJoseRequest, type JoseRequest } from '../../services/jose/joseRequestStore';
import { cancelPlan } from '../../services/jose/submitToJose';

export interface JosePlanCardProps {
  requestId: string;
  onRun: (requestId: string) => void;
  onOpenBoard?: (requestId: string) => void;
}

export function JosePlanCard({ requestId, onRun, onOpenBoard }: JosePlanCardProps) {
  const [request, setRequest] = useState<JoseRequest | null>(() => getJoseRequest(requestId));
  useEffect(() => {
    const timer = setInterval(() => setRequest(getJoseRequest(requestId)), 2000);
    return () => clearInterval(timer);
  }, [requestId]);

  if (!request) return null;
  const waiting = request.status === 'waiting_plan_approval';
  return (
    <div className="mt-2 space-y-2" data-testid="jose-plan-card">
      <JosePlanMap steps={request.steps} compact />
      {requestPlanLabel(request) && <div className="text-[11px] text-(--text-3)">{requestPlanLabel(request)}</div>}
      {waiting ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => onRun(requestId)}>Run this plan</Button>
          {onOpenBoard && <Button size="sm" onClick={() => onOpenBoard(requestId)}>Edit on the board</Button>}
          <Button size="sm" variant="ghost" onClick={() => { cancelPlan(requestId); setRequest(getJoseRequest(requestId)); }}>Cancel</Button>
        </div>
      ) : (
        <div className="text-[11px] text-(--text-3)">
          {request.status === 'cancelled' ? 'This plan was cancelled.' : 'This plan has started; see the board for progress.'}
          {onOpenBoard && <button type="button" className="ml-2 underline" onClick={() => onOpenBoard(requestId)}>Open on the board</button>}
        </div>
      )}
    </div>
  );
}
