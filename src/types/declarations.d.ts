declare module '*/sessionIntelligenceService' {
  export const SESSION_EVENT_SCOPE: string;
  export function appendSessionEvent(event: {
    agent?: string;
    action?: string;
    commandId?: string | null;
    summary?: string;
    confidence?: string;
    verificationState?: string;
  }): unknown;
  export function listSessionEvents(): unknown[];
  export function summarizeSession(hours?: number): string;
}

declare module '*/runtimeLedgerService' {
  export function listScopeRecords(scope: string, limit?: number): Promise<unknown[]>;
  export function persistScopeRows(
    scope: string,
    rows?: unknown[],
    toRecord?: (row: unknown) => unknown
  ): Promise<void>;
  export function hydrateScopeToLocalStorage(scope: string, storageKey: string): Promise<void>;
  export function bootstrapRuntimeLedgerHydration(mappings?: { scope: string; storageKey: string }[]): Promise<void>;
}

declare module '*/agentBusService' {
  export const PACKET_SCOPE: string;
  export const AGENTS: Record<string, { role: string; model: string }>;
  export function listAgentPackets(): unknown[];
  export function createAgentPacket(params: {
    agent: string;
    action: string;
    targetAgent?: string;
    payload?: Record<string, unknown>;
    source?: string;
  }): unknown;
  export function updatePacketStatus(
    packetId: string,
    status: string,
    updates?: Record<string, unknown>
  ): unknown;
  export function getPacketById(packetId: string): unknown;
  export function approvePacket(packetId: string, approvedBy?: string): unknown;
  export function rejectPacket(packetId: string, reason?: string): unknown;
  export function markPacketExecuted(
    packetId: string,
    executionResult?: unknown,
    verificationState?: string
  ): unknown;
  export function markPacketFailed(packetId: string, failureReason: string, retryable?: boolean): unknown;
  export function requestPacketRetry(packetId: string, reason?: string): unknown;
  export function sendPacketToDeadLetter(packetId: string, reason?: string): unknown;
  export function canExecutePacket(packet: unknown): boolean;
  export function attemptPacketExecution(packetId: string, executionResult?: unknown): unknown;
  export function addPacketReference(packetId: string, reference: unknown): unknown;
  export function listApprovalQueue(): unknown[];
  export function listPacketsByStatus(status: string): unknown[];
  export function listDeadLetterPackets(): unknown[];
  export function listFailedRetryablePackets(): unknown[];
}
