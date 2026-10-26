// What Maria's step returns to the engine (agent phase 3).
export interface MariaStepResult {
  summary: string;
  resultState: 'completed' | 'failed';
  resultUrl: null;
  artifacts: [];
  sources: string[];
  contractAction: string;
  schema: Record<string, any> | null;
  failureReason?: string;
}

export interface MariaAssignment {
  agent?: string;
  actionType?: string;
  stepId?: string;
  packetId?: string;
  commandId?: string;
  reviewOf?: string;
  instruction?: string;
  [key: string]: unknown;
}

export const MARIA_SECURITY_LINE = "Security (secrets, unsafe links or commands, permissions) is Sentinel's: when you see one, put it in \"help\" as: security check of <what>.";
