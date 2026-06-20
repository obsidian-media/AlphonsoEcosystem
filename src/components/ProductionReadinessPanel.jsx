import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FolderOpen, RefreshCw, Shield, ShieldAlert, Sparkles, Workflow } from 'lucide-react';
import { collectProductionReadinessSnapshot, getLastProductionReadinessReport, summarizeCommandProofs, summarizeProductionReadiness } from '../services/productionReadinessService';
import { formatNativeProofDetail } from '../services/nativeRc0ProofService';
import { getDefaultWorkspaceRoot, validateWorkspaceRoot } from '../services/workspaceRootService';

const STATE_STYLES = {
  confirmed: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
  configured: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
  foundation_only: 'border-slate-300/20 bg-slate-500/10 text-slate-200',
  not_configured: 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200',
  invalid: 'border-amber-300/20 bg-amber-500/10 text-amber-200',
  ready: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-300/20 bg-amber-500/10 text-amber-200',
  setup_required: 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200',
  blocked: 'border-red-300/20 bg-red-500/10 text-red-200',
  failed: 'border-red-300/20 bg-red-500/10 text-red-200',
  unknown: 'border-zinc-300/20 bg-zinc-500/10 text-zinc-200'
};

const TRUTH_LABELS = new Set(['confirmed', 'configured', 'foundation_only', 'partial', 'setup_required', 'blocked', 'failed', 'unknown', 'invalid', 'not_configured']);

function displayTruthState(state, { workspaceOk = true } = {}) {
  const clean = String(state || 'unknown').trim().toLowerCase();
  if (!workspaceOk && clean !== 'failed' && clean !== 'blocked') {
    return 'setup_required';
  }
  if (clean === 'ready' || clean === 'verified' || clean === 'recorded') {
    return 'confirmed';
  }
  return TRUTH_LABELS.has(clean) ? clean : 'unknown';
}

function readinessRowShellClass(state, workspaceOk = true) {
  const truth = displayTruthState(state, { workspaceOk });
  if (truth === 'configured') {
    return 'border-emerald-400/30 bg-emerald-500/5';
  }
  if (truth === 'foundation_only') {
    return 'border-slate-400/30 bg-slate-500/10';
  }
  if (truth === 'not_configured' || truth === 'invalid') {
    return 'border-amber-400/30 bg-amber-500/5';
  }
  if (truth === 'setup_required') {
    return 'border-indigo-400/35 bg-indigo-500/10';
  }
  if (truth === 'blocked' || truth === 'failed') {
    return 'border-red-400/35 bg-red-500/10';
  }
  if (truth === 'partial' || truth === 'unknown') {
    return 'border-amber-400/30 bg-amber-500/5';
  }
  return 'border-white/10 bg-zinc-900/55';
}

function StateBadge({ state, workspaceOk = true }) {
  const normalized = displayTruthState(state, { workspaceOk });
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATE_STYLES[normalized] || STATE_STYLES.unknown}`}>
      {normalized}
    </span>
  );
}

function StatCard({ label, value, state, detail, workspaceOk = true }) {
  return (
    <div className={`rounded-2xl border p-4 ${readinessRowShellClass(state, workspaceOk)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <StateBadge state={state} workspaceOk={workspaceOk} />
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {detail && <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{detail}</div>}
    </div>
  );
}

function SectionPanel({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/72 p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
        <Icon className="h-4 w-4 text-indigo-300" />
        {title}
      </div>
      {children}
    </section>
  );
}

export function ProductionReadinessPanel({
  settings,
  setSettings,
  updateCheckState,
  verificationLogs = [],
  workspaceFoundation = {},
  ollamaStatus,
  nativeSelfDevProof = null
}) {
  const [report, setReport] = useState(() => getLastProductionReadinessReport());
  const [workspaceValidation, setWorkspaceValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validatingWorkspace, setValidatingWorkspace] = useState(false);
  const [error, setError] = useState('');
  const workspaceRoot = String(settings?.workspaceRoot || '').trim();
  const resolvedWorkspaceRoot = workspaceRoot || getDefaultWorkspaceRoot();

  const refresh = async () => {
    if (!resolvedWorkspaceRoot) {
      setError('Workspace root is setup-required before production readiness can be audited.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await collectProductionReadinessSnapshot({
        root: resolvedWorkspaceRoot,
        settings,
        updateCheckState,
        verificationLogs,
        workspaceFoundation
      });
      setReport(next);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  const validateWorkspace = async () => {
    setValidatingWorkspace(true);
    try {
      const result = await validateWorkspaceRoot(resolvedWorkspaceRoot);
      setWorkspaceValidation(result);
      return result;
    } catch (cause) {
      const failure = {
        ok: false,
        status: 'blocked',
        root: resolvedWorkspaceRoot,
        error: String(cause),
        requiredEntries: ['package.json', 'src', 'src-tauri', 'docs'].map((path) => ({ path, exists: false })),
        missingEntries: ['package.json', 'src', 'src-tauri', 'docs']
      };
      setWorkspaceValidation(failure);
      return failure;
    } finally {
      setValidatingWorkspace(false);
    }
  };

  const setCurrentWorkspace = async () => {
    if (!setSettings) return;
    const nextRoot = getDefaultWorkspaceRoot();
    setSettings((current) => ({ ...current, workspaceRoot: nextRoot }));
    await validateWorkspaceRoot(nextRoot).then(setWorkspaceValidation).catch(() => {});
  };

  useEffect(() => {
    if (resolvedWorkspaceRoot) {
      void refresh();
      void validateWorkspace();
      return;
    }
    setReport(getLastProductionReadinessReport());
  }, [resolvedWorkspaceRoot]);

  const summary = useMemo(() => summarizeProductionReadiness(report), [report]);
  const commandProofs = useMemo(() => summarizeCommandProofs(verificationLogs), [verificationLogs]);
  const rows = Array.isArray(report?.readinessRows) ? report.readinessRows : [];
  const connectorRows = rows.filter((row) => row.kind === 'connector' || row.kind === 'tool_connection');
  const matrixRows = rows.filter((row) => row.kind !== 'connector' && row.kind !== 'tool_connection');

  const missingUpdaterEnv = report?.releaseState?.missing || {};
  const workspaceOk = workspaceValidation?.ok === true;
  const workspaceState = displayTruthState(report?.overallState || summary.overallState || 'unknown', { workspaceOk });
  const releaseReadyState = displayTruthState(report?.releaseState?.state || 'unknown', { workspaceOk });
  const nativeProofDisplayState = displayTruthState(nativeSelfDevProof?.state || 'unknown', { workspaceOk });
  const blockersLookClear = Array.isArray(report?.liveBlockers)
    && report.liveBlockers.length === 0
    && workspaceOk
    && workspaceState === 'confirmed';

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-indigo-950/35 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              <Shield className="h-4 w-4 text-emerald-300" />
              Production Readiness
            </div>
            <h2 className="text-2xl font-semibold text-white">Supervised production readiness truth panel</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
              This view surfaces what is confirmed, what is partial, what still needs setup, and which surfaces are live blockers before Alphonso can be treated as production-ready.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing' : 'Refresh audit'}
            </button>
            <StateBadge state={workspaceState} workspaceOk={workspaceOk} />
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/55 p-3 text-sm text-zinc-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-indigo-300" />
              <span className="font-semibold text-white">Workspace root</span>
            </div>
            <StateBadge state={workspaceValidation?.status || (workspaceRoot ? 'unknown' : 'setup_required')} workspaceOk={workspaceOk} />
          </div>
          <div className="mt-2 font-mono text-[11px] text-zinc-400">{resolvedWorkspaceRoot}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {workspaceValidation?.error || 'Workspace validation runs locally before production readiness or self-development scans proceed.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={setCurrentWorkspace}
              disabled={!setSettings}
              className="rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Set Current Workspace
            </button>
            <button
              onClick={validateWorkspace}
              disabled={validatingWorkspace}
              className="rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {validatingWorkspace ? 'Validating' : 'Validate Workspace'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {(workspaceValidation?.requiredEntries || ['package.json', 'src', 'src-tauri', 'docs']).map((entry) => {
              const row = typeof entry === 'string' ? { path: entry, exists: false } : entry;
              return (
                <div key={row.path} className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-[10px] font-mono text-zinc-400">
                  {row.path} <span className={row.exists ? 'text-emerald-300' : 'text-amber-300'}>{row.exists ? 'present' : 'missing'}</span>
                </div>
              );
            })}
          </div>
        </div>
        {!workspaceRoot && (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Workspace root is not configured yet. Production readiness and self-development scans are setup-required until Alphonso knows the repo path.
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard workspaceOk={workspaceOk} label="Overall State" value={workspaceState} state={workspaceState} detail={`Audit summary: ${summary.blockerCount} blockers, ${summary.issueCount} truth issues, ${summary.needsSetupCount} needs setup`} />
        <StatCard
          workspaceOk={workspaceOk}
          label="Build / Test"
          value={buildProofLabel(commandProofs)}
          state={buildProofState(commandProofs)}
          detail="Build/test/tauri proofs are read from command execution verification logs only."
        />
        <StatCard
          workspaceOk={workspaceOk}
          label="Native Self-Dev"
          value={nativeSelfDevProof?.state || 'not run'}
          state={nativeProofDisplayState}
          detail={formatNativeProofDetail(nativeSelfDevProof)}
        />
        <StatCard
          workspaceOk={workspaceOk}
          label="Workflow Durability"
          value={typeof report?.workflowSummary?.runs === 'number' ? `${report.workflowSummary.runs} runs` : 'unknown'}
          state={displayTruthState(summary.workflowReady, { workspaceOk })}
          detail={`${report?.workflowSummary?.receipts || 0} workflow receipts in local storage. Reload to verify hydration; release/rc0/workflow-durability-proof.md is baseline text only - not live confirmation.`}
        />
        <StatCard workspaceOk={workspaceOk} label="Release / Updater" value={releaseReadyState} state={releaseReadyState} detail={report?.releaseState?.evidence || 'Updater signing and hosted manifest remain setup-required until signed assets and hosted proof exist.'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionPanel icon={ShieldAlert} title="Live Production Blockers">
          {Array.isArray(report?.liveBlockers) && report.liveBlockers.length > 0 ? (
            <div className="space-y-2">
              {report.liveBlockers.map((blocker) => (
                <div key={blocker} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {blocker}
                </div>
              ))}
            </div>
          ) : blockersLookClear ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              No live blockers in the latest audit snapshot (workspace validated).
            </div>
          ) : (
            <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100">
              Blocker list is empty but overall readiness is not confirmed. Validate workspace, native proof artifacts, and updater evidence before treating this as clear.
            </div>
          )}
        </SectionPanel>

        <SectionPanel icon={Workflow} title="Release / Update Proof">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <StatCard workspaceOk={workspaceOk} label="Installer" value={report?.releaseProof?.installerFound ? 'confirmed' : 'setup_required'} state={report?.releaseProof?.installerFound ? 'confirmed' : 'setup_required'} detail={report?.releaseProof?.installerPath || 'No installer artifact on disk.'} />
            <StatCard workspaceOk={workspaceOk} label="Signature" value={report?.releaseProof?.signatureFound ? 'confirmed' : 'setup_required'} state={report?.releaseProof?.signatureFound ? 'confirmed' : 'setup_required'} detail={report?.releaseProof?.signaturePath || 'No .sig artifact on disk.'} />
            <StatCard workspaceOk={workspaceOk} label="latest.json" value={report?.releaseProof?.latestJsonFound ? 'present' : 'setup_required'} state={report?.releaseProof?.manifestValid ? 'confirmed' : 'setup_required'} detail={report?.releaseProof?.latestJsonPath || 'Hosted manifest proof not collected.'} />
            <StatCard workspaceOk={workspaceOk} label="Updater Config" value={report?.updateCheckState?.configured ? 'configured' : 'setup_required'} state={report?.updateCheckState?.configured && report?.releaseProof?.manifestValid ? 'partial' : 'setup_required'} detail={report?.updateCheckState?.available ? `Feed reachable (${report.updateCheckState.latestVersion || 'version unknown'}). Signing proof still required.` : 'Endpoint and pubkey must both be set.'} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3">
              <div className="font-semibold text-zinc-200">Signing env</div>
              <div className="mt-1">TAURI_SIGNING_PRIVATE_KEY: {boolLabel(report?.signingEnv?.TAURI_SIGNING_PRIVATE_KEY)}</div>
              <div>TAURI_SIGNING_PRIVATE_KEY_PASSWORD: {boolLabel(report?.signingEnv?.TAURI_SIGNING_PRIVATE_KEY_PASSWORD)}</div>
              <div>ALPHONSO_UPDATE_BASE_URL: {boolLabel(report?.signingEnv?.ALPHONSO_UPDATE_BASE_URL)}</div>
              <div>GITHUB_REPOSITORY: {boolLabel(report?.signingEnv?.GITHUB_REPOSITORY)}</div>
              <div>GITHUB_TOKEN: {boolLabel(report?.signingEnv?.GITHUB_TOKEN)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3">
              <div className="font-semibold text-zinc-200">Updater evidence</div>
              <div className="mt-1 text-zinc-400">{report?.releaseState?.evidence || 'No release scan evidence yet.'}</div>
              {Array.isArray(missingUpdaterEnv?.updater) && missingUpdaterEnv.updater.length > 0 && (
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-300">
                  Missing: {missingUpdaterEnv.updater.join(', ')}
                </div>
              )}
              {Array.isArray(missingUpdaterEnv?.signing) && missingUpdaterEnv.signing.length > 0 && (
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-300">
                  Signing missing: {missingUpdaterEnv.signing.join(', ')}
                </div>
              )}
              <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-zinc-200">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Setup command</div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-zinc-300">
{`$env:TAURI_SIGNING_PRIVATE_KEY="..."
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..."
$env:ALPHONSO_UPDATE_BASE_URL="..."
npm.cmd run release:updater`}
                </pre>
              </div>
            </div>
          </div>
        </SectionPanel>
      </div>

      <SectionPanel icon={CheckCircle2} title="Readiness Matrix">
        <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
          Truth labels: confirmed, partial, setup_required, blocked, failed. setup_required is never shown as ready.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matrixRows.map((row) => (
            <div key={row.id} className={`rounded-2xl border p-3 ${readinessRowShellClass(row.state, workspaceOk)}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{row.label}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{row.evidence}</div>
                </div>
                <StateBadge state={row.state} workspaceOk={workspaceOk} />
              </div>
              {row.detail && <div className="mt-2 text-[11px] text-zinc-400">{row.detail}</div>}
            </div>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel icon={Sparkles} title="Connector Readiness Matrix">
        <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
          Connectors are fail-closed: configured / not_configured / invalid / unknown / setup_required. External live requires configured env plus a verified health check - not just a registry flag.
        </p>
        <div className="space-y-2">
          {connectorRows.map((row) => {
            const connectorTruth = displayConnectorRowState(row);
            return (
            <div key={row.id} className={`rounded-2xl border p-3 ${readinessRowShellClass(connectorTruth, workspaceOk)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{row.name}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {row.kind === 'tool_connection' ? 'Tool connection' : 'Connector'} | auth {row.authEnabled ? 'enabled' : 'disabled'} | allowlist {row.allowlistCount}
                  </div>
                </div>
                <StateBadge state={connectorTruth} workspaceOk={workspaceOk} />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 md:grid-cols-2">
                <div>Configured: {row.configured || 'unknown'}</div>
                <div>External live: {connectorTruth === 'configured' ? 'yes (artifact-backed)' : 'no'}</div>
                <div>Env state: {row.envStatus}</div>
                <div>Allowlist: {row.allowlistStatus || 'unknown'}</div>
                <div>Test action: {row.testAction}</div>
                <div>Last test: {row.lastTestResult || 'unknown'}</div>
                <div>Approval: {row.approvalRequired ? 'required' : 'not required'}</div>
                <div>Receipt: {row.receiptStatus || 'unknown'}</div>
                <div>Zero-cost: {row.zeroCostPolicy}</div>
                {row.localRuntimeHealth && (
                  <>
                    <div>Local runtime probe: {row.localRuntimeHealth.ok ? 'verified' : 'failed'}</div>
                    <div>Probe endpoint: {row.localRuntimeHealth.endpoint || 'unknown'}</div>
                    <div>Probe path: {row.localRuntimeHealth.probePath || 'unknown'}</div>
                    <div>Probe HTTP: {row.localRuntimeHealth.httpStatus || 'unknown'}</div>
                  </>
                )}
              </div>
              {row.lastTestAtMs && <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Last checked: {new Date(row.lastTestAtMs).toLocaleString()}</div>}
              {row.missingEnv?.length > 0 && (
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-300">
                  Missing env: {row.missingEnv.join(', ')}
                </div>
              )}
              {row.failureReason && <div className="mt-1 text-[11px] text-red-200">{row.failureReason}</div>}
            </div>
            );
          })}
        </div>
      </SectionPanel>
    </div>
  );
}

function boolLabel(value) {
  return value ? 'present' : 'setup_required';
}

function buildProofState(commandProofs = {}) {
  const anyFailed = ['build', 'test', 'tauriBuild'].some((key) => commandProofs[key] && !commandProofs[key].ok);
  const anyPresent = ['build', 'test', 'tauriBuild'].some((key) => Boolean(commandProofs[key]));
  if (anyFailed) return 'failed';
  if (anyPresent) return 'confirmed';
  return 'setup_required';
}

function displayConnectorRowState(row = {}) {
  const configured = String(row.configured || 'unknown').trim().toLowerCase();
  const envStatus = String(row.envStatus || 'unknown').trim().toLowerCase();
  const lastTest = String(row.lastTestResult || 'unknown').trim().toLowerCase();
  const state = String(row.state || 'unknown').trim().toLowerCase();
  if (configured === 'foundation_only' || state === 'foundation_only') {
    return 'foundation_only';
  }
  if (configured === 'not_configured' || state === 'setup_required' || envStatus === 'missing' || envStatus === 'setup_required') {
    return 'setup_required';
  }
  if (lastTest === 'failed' || lastTest === 'unknown') {
    return 'setup_required';
  }
  if (configured === 'configured' && lastTest === 'verified') {
    return 'configured';
  }
  if (state === 'invalid') {
    return 'invalid';
  }
  return 'unknown';
}

function buildProofLabel(commandProofs = {}) {
  const labels = [];
  if (commandProofs.build) labels.push(`build:${commandProofs.build.ok ? 'confirmed' : 'failed'}`);
  if (commandProofs.test) labels.push(`test:${commandProofs.test.ok ? 'confirmed' : 'failed'}`);
  if (commandProofs.tauriBuild) labels.push(`tauri:${commandProofs.tauriBuild.ok ? 'confirmed' : 'failed'}`);
  return labels.length > 0 ? labels.join(' | ') : 'setup_required';
}
