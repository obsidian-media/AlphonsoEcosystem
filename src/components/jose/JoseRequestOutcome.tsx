import React, { useEffect, useRef, useState } from 'react';
import { getJoseRequest, type JoseRequestStatus } from '../../services/jose/joseRequestStore';
import { closingSummary } from '../../services/jose/joseSummary';

const WAITING: JoseRequestStatus[] = ['waiting_approval', 'waiting_plan_approval', 'waiting_setup', 'running', 'interrupted'];
const ENDED: JoseRequestStatus[] = ['done', 'failed', 'cancelled', 'expired'];

/**
 * Under a Chat reply that was still waiting (agent phase 5): once the request ends, approved on
 * the board or on Telegram, it shows what happened. Chat used to keep saying "waiting for your
 * approval".
 */
export function JoseRequestOutcome({ requestId }: { requestId: string }): React.JSX.Element | null {
  const wasWaiting = useRef<boolean | null>(null);
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    const check = () => {
      const request = getJoseRequest(requestId);
      if (!request) return true;
      if (wasWaiting.current === null) wasWaiting.current = WAITING.includes(request.status);
      if (!wasWaiting.current) return true;
      if (ENDED.includes(request.status)) {
        setOutcome(closingSummary(request));
        return true;
      }
      return false;
    };
    if (check()) return undefined;
    const timer = setInterval(() => { if (check()) clearInterval(timer); }, 5000);
    return () => clearInterval(timer);
  }, [requestId]);

  if (!outcome) return null;
  return (
    <p className="mt-2 whitespace-pre-wrap text-[12px] text-(--text-2)" data-testid="chat-request-outcome">{`Now: ${outcome}`}</p>
  );
}
