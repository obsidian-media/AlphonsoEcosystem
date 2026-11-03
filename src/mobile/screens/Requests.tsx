import React from 'react';
import { JoseRequestsBoard } from '../../components/jose/JoseRequestsBoard';
import { LinkWarningHost } from '../../components/sentinel/LinkWarning';

/** The desktop's Requests board, in one column (its two columns start at tablet width). */
export function RequestsScreen({ selectedRequestId }: { selectedRequestId?: string } = {}) {
  return (
    <div data-testid="mobile-requests" className="flex flex-col gap-3 pt-2">
      <JoseRequestsBoard selectedRequestId={selectedRequestId} />
      {/* A source link that looks disguised asks before it opens, as on the computer. */}
      <LinkWarningHost />
    </div>
  );
}
