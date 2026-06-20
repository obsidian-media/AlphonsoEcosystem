export interface CommandProof {
  program: string;
  args: string[];
  cwd: string | null;
  startedAtMs: number;
  finishedAtMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  trust: string;
}

export interface PathProof {
  path: string;
  exists: boolean;
  isFile: boolean;
  isDir: boolean;
  modifiedAtMs: number | null;
  trust: string;
}

export interface RuntimeEnvValueProof {
  name: string;
  present: boolean;
  value: string | null;
  checkedAtMs: number;
  trust: string;
  error: string | null;
}

export interface ProcessMatch {
  name: string;
  pid: number | null;
}

export interface ProcessProof {
  query: string;
  running: boolean;
  matches: ProcessMatch[];
  trust: string;
}

export interface RestorePointProof {
  snapshotId: string;
  filePath: string;
  written: boolean;
  writtenAtMs: number;
  trust: string;
}

export interface HandoffExportProof {
  filePath: string;
  written: boolean;
  writtenAtMs: number;
  bytes: number;
  trust: string;
}

export interface ConnectorPollProof {
  connectorId: string;
  ok: boolean;
  count: number;
  cursor: number | null;
  messages: ConnectorInboundMessage[];
  checkedAtMs: number;
  trust: string;
  error: string | null;
}

export interface ConnectorInboundMessage {
  updateId: number;
  chatId: string;
  fromId: string | null;
  text: string;
  dateUnix: number | null;
  receivedAtMs: number;
}

export interface ConnectorSendProof {
  connectorId: string;
  ok: boolean;
  target: string;
  externalId: string | null;
  sentAtMs: number;
  trust: string;
  error: string | null;
}

export interface OcrCapabilityProof {
  available: boolean;
  engine: string;
  message: string;
  checkedAtMs: number;
  trust: string;
}

export interface OcrAdapterProof {
  adapter: string;
  enginePath: string;
  imagePath: string | null;
  startedAtMs: number;
  finishedAtMs: number;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  trust: string;
  error: string | null;
}

export interface JoseAssignmentProof {
  agent: string;
  title: string;
  rationale: string;
  actionType: string;
  riskLevel: string;
  requiresApproval: boolean;
  commandPreview: string;
  decomposition: string[];
}

export interface AppUpdateCheckProof {
  configured: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  checkedAtMs: number;
  trust: string;
  error: string | null;
}

export interface UrlOpenProof {
  url: string;
  opened: boolean;
  openedAtMs: number;
  trust: string;
}

export interface UrlFetchProof {
  url: string;
  status: number;
  content: string;
  title: string;
  fetchedAtMs: number;
  trust: string;
  error: string | null;
}

export interface ClipboardProof {
  action: string;
  content: string;
  performedAtMs: number;
  trust: string;
}

export interface YouTubeUploadProof {
  connectorId: string;
  ok: boolean;
  videoId: string | null;
  url: string | null;
  privacyStatus: string;
  filePath: string;
  uploadedAtMs: number;
  trust: string;
  error: string | null;
}

export interface WebhookPostProof {
  ok: boolean;
  platform: string;
  connectionName: string | null;
  webhookHost: string | null;
  httpStatus: number | null;
  responsePreview: string | null;
  sentAtMs: number;
  trust: string;
  error: string | null;
}

export interface MediaGenerationProof {
  connectorId: string;
  ok: boolean;
  provider: string;
  jobId: string | null;
  outputPaths: string[];
  previewBase64: string | null;
  queuedAtMs: number;
  trust: string;
  message: string;
  error: string | null;
}

export interface LocalRuntimeHealthProof {
  connectorId: string;
  provider: string;
  ok: boolean;
  endpoint: string;
  probePath: string;
  httpStatus: number | null;
  checkedAtMs: number;
  trust: string;
  message: string;
  error: string | null;
}

export interface OllamaRuntimeProof {
  endpoint: string;
  reachable: boolean;
  httpStatus: number | null;
  models: string[];
  reason: string | null;
  checkedAtMs: number;
  trust: string;
}

export interface OllamaModelInfo {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  digest: string | null;
  details: unknown;
}

export interface OllamaModelsProof {
  endpoint: string;
  httpStatus: number | null;
  models: OllamaModelInfo[];
  trust: string;
  reason: string | null;
}

export interface OllamaGenerateProof {
  endpoint: string;
  httpStatus: number | null;
  model: string;
  response: string;
  done: boolean;
  trust: string;
  error: string | null;
}
