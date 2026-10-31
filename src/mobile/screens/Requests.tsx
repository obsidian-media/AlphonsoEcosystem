import React from 'react';
import { JoseRequestsBoard } from '../../components/jose/JoseRequestsBoard';

/** The desktop's Requests board, in one column (its two columns start at tablet width). */
export function RequestsScreen() {
  return (
    <div data-testid="mobile-requests" className="flex flex-col gap-3 pt-2">
      <JoseRequestsBoard />
    </div>
  );
}
