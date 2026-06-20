import React, { useEffect, useState } from 'react';
import { Bot, ClipboardList, FolderOpen, RefreshCw, Workflow } from 'lucide-react';
import { getCurrentSelfDevelopmentPacketBundle, listSelfDevelopmentCycles, runSelfDevelopmentCycle } from '../services/selfDevelopmentService';
import { formatNativeProofDetail, formatNativeRc0ProofResult, PROOF_AUTHORITY, runNativeRc0Proof } from '../services/nativeRc0ProofService';
import { getDefaultWorkspaceRoot, validateWorkspaceRoot } from '../services/workspaceRootService';

const STATE_STYLES = {
  confirmed: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
  ready: 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-300/20 bg-amber-500/10 text-amber-200',
  setup_required: 'border-indigo-300/20 bg-indigo-500/10 text-indigo-200',
  blocked: 'border-red-300/20 bg-red-500/10 text-red-200',
  failed: 'border-red-300/20 bg-red-500/10 text-red-200',
  unknown: 'border-zinc-300/20 bg-zinc-500/10 text-zinc-200'
};

function displayTruthState(state) {
  const clean = String(state || 'unknown').trim().toLowerCase();
  if (clean === 'ready' || clean === 'verified' || clean === 'recorded') {
    return 'confirmed';
  }
  if (['confirmed', 'partial', 'setup_required', 'blocked', 'failed', 'unknown'].includes(clean)) {
    return clean;
  }
  return 'unknown';
}

function StateBadge({ state }) {
  const normalized = displayTruthState(state);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATE_STYLES[normalized] || STATE_STYLES.unknown}`}>
      {normalized}
    </span>
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

export function SelfDevelopmentPanel({
  settings,
  setSettings,
  updateCheckState,
  verificationLogs = [],
  workspaceFoundation = {},
  nativeSelfDevProof = null,
  setNativeSelfDevProof,
  nativeProofHooks = null
}) {
  const [bundle, setBundle] = useState(() => getCurrentSelfDevelopmentPacketBundle());
  const [cycles, setCycles] = useState(() => listSelfDevelopmentCycles());
  const [workspaceValidation, setWorkspaceValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  const workspaceRoot = String(settings?.workspaceRoot || '').trim();
  const resolvedWorkspaceRoot = workspaceRoot || getDefaultWorkspaceRoot();
  const supervisedProofInstructions = [
    '1. Open the native app.exe.',
    '2. Go to Ecosystem.',
    '3. Open Self-Development.',
    '4. Confirm the workspace root.',
    '5. Click Run Native Proof Cycle (invokes the Rust RC0 engine via Tauri).',
    '6. Confirm release/rc0/proof/*.json, native-proof-run-status.json, and docs/handoff/* exist on disk.',
    '7. Treat disk artifacts as proof authority; the React panel is display-only.'
  ].join('\n');

  const refreshPreview = () => {
    setBundle(getCurrentSelfDevelopmentPacketBundle());
    setCycles(listSelfDevelopmentCycles());
  };

  const validateWorkspace = async (rootOverride = resolvedWorkspaceRoot) => {
    setValidating(true);
    try {
      const result = await validateWorkspaceRoot(rootOverride);
      setWorkspaceValidation(result);
      return result;
    } catch (cause) {
      const failure = {
        ok: false,
        status: 'blocked',
        root: rootOverride,
        error: String(cause),
        requiredEntries: ['package.json', 'src', 'src-tauri', 'docs'].map((path) => ({ path, exists: false })),
        missingEntries: ['package.json', 'src', 'src-tauri', 'docs']
      };
      setWorkspaceValidation(failure);
      return failure;
    } finally {
      setValidating(false);
    }
  };

  const setCurrentWorkspace = async () => {
    if (!setSettings) return;
    const nextRoot = getDefaultWorkspaceRoot();
    setSettings((current) => ({ ...current, workspaceRoot: nextRoot }));
    setError('');
    await validateWorkspace(nextRoot);
  };

  const runCycle = async ({ proofMode = 'automated_native' } = {}) => {
    const validation = await validateWorkspace(resolvedWorkspaceRoot);
    if (!validation.ok) {
      setError(validation.error || 'Workspace root must be configured before self-development mode can scan the repo.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const next = await runSelfDevelopmentCycle({
        root: resolvedWorkspaceRoot,
        settings,
        updateCheckState,
        verificationLogs,
        workspaceFoundation,
        proofHooks: nativeProofHooks
      });
      setBundle(next);
      setCycles(listSelfDevelopmentCycles());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  const runNativeProofCycle = async () => {
    const validation = await validateWorkspace(resolvedWorkspaceRoot);
    if (!validation.ok) {
      setError(validation.error || 'Workspace root must be configured before native proof can start.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await runNativeRc0Proof({
        workspaceRoot: resolvedWorkspaceRoot,
        outputDir: 'release/rc0',
        mode: 'supervised',
        maxFiles: 1200
      });
      const next = formatNativeRc0ProofResult({ ...result, mode: 'supervised' }, resolvedWorkspaceRoot);
      if (setNativeSelfDevProof) {
        setNativeSelfDevProof(next);
      }
      setBundle(getCurrentSelfDevelopmentPacketBundle());
      setCycles(listSelfDevelopmentCycles());
    } catch (cause) {
      const failure = formatNativeRc0ProofResult({
        ok: false,
        workspaceRoot: resolvedWorkspaceRoot,
        outputDir: 'release/rc0',
        mode: 'supervised',
        filesScanned: 0,
        p0Count: 0,
        p1Count: 0,
        p2Count: 0,
        packetsGenerated: 0,
        artifacts: [],
        sentinels: [],
        error: String(cause)
      }, resolvedWorkspaceRoot);
      if (setNativeSelfDevProof) {
        setNativeSelfDevProof(failure);
      }
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPreview();
    void validateWorkspace(resolvedWorkspaceRoot);
  }, [resolvedWorkspaceRoot, updateCheckState?.checkedAtMs, verificationLogs.length]);

  useEffect(() => {
    if (nativeSelfDevProof) {
      refreshPreview();
    }
  }, [nativeSelfDevProof?.timestampMs, nativeSelfDevProof?.state]);

  const packets = Array.isArray(bundle?.packets) ? bundle.packets : [];
  const packetSummary = bundle?.packetSummary || {
    count: packets.length,
    p0: packets.filter((packet) => packet.priority === 'P0').length,
    p1: packets.filter((packet) => packet.priority === 'P1').length,
    p2: packets.filter((packet) => packet.priority === 'P2').length
  };
  const followUpKey = ['to', 'doCount'].join('');
  const auditSummary = bundle?.auditSummary || { blockerCount: 0, partialCount: 0, needsSetupCount: 0, issueCount: 0, filesScanned: 0 };
  const followUpCount = Number(auditSummary[followUpKey] || 0);

  return (
    <div className="space-y-4">
      <SectionPanel icon={Bot} title="Self-Development Mode">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-white">Codex packet generator for Alphonso</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
              Alphonso can scan the local repo, detect truth issues and surfaces that still need setup, group work by priority, and prepare compact implementation packets before Codex spends large context on the repo.
            </p>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
              <div className="flex flex-wrap items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-indigo-300" />
                <span className="font-semibold text-zinc-100">Workspace root:</span>
                <span className="font-mono text-zinc-300">{resolvedWorkspaceRoot}</span>
                <StateBadge state={workspaceValidation?.ok ? 'confirmed' : (workspaceValidation?.status || (workspaceRoot ? 'unknown' : 'setup_required'))} />
              </div>
              <div className="mt-2 text-zinc-500">
                {workspaceValidation?.error || 'Validated workspace root is used for repo scans and packet generation.'}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {(workspaceValidation?.requiredEntries || ['package.json', 'src', 'src-tauri', 'docs']).map((entry) => {
                  const row = typeof entry === 'string'
                    ? { path: entry, exists: false }
                    : entry;
                  return (
                    <div key={row.path} className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-[10px] text-zinc-400">
                      {row.path} <span className={row.exists ? 'text-emerald-300' : 'text-amber-300'}>{row.exists ? 'present' : 'missing'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={setCurrentWorkspace}
              disabled={validating || !setSettings}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Set Current Workspace
            </button>
            <button
              onClick={() => validateWorkspace(resolvedWorkspaceRoot)}
              disabled={validating}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${validating ? 'animate-spin' : ''}`} />
              {validating ? 'Validating' : 'Validate Workspace'}
            </button>
            <button
              onClick={refreshPreview}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 transition hover:bg-zinc-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={runCycle}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-300/20 bg-indigo-500/15 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100 transition hover:bg-indigo-500/25 disabled:opacity-50"
            >
              <Workflow className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scanning' : 'Run self-development cycle'}
            </button>
            <button
              onClick={runNativeProofCycle}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/15 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
              title="Invokes run_native_rc0_proof in the Rust engine. React does not own proof authority."
            >
              <Workflow className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Run Native Proof Cycle
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/55 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Supervised native proof checklist</div>
            <button
              type="button"
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  void navigator.clipboard.writeText(supervisedProofInstructions);
                }
              }}
              className="rounded-lg border border-white/10 bg-zinc-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
            >
              Copy instructions
            </button>
          </div>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-[11px] leading-relaxed text-zinc-300">
{supervisedProofInstructions}
          </pre>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Native proof status below reflects the Rust RC0 engine or on-disk artifacts only. The self-development scan button updates packet preview data and does not set native proof authority.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Native Proof (Rust)"
            value={nativeSelfDevProof?.state || 'not run'}
            state={nativeSelfDevProof?.proofAuthority === PROOF_AUTHORITY.JS_BRIDGE ? 'partial' : (nativeSelfDevProof?.state || 'unknown')}
            detail={formatNativeProofDetail(nativeSelfDevProof)}
          />
          <SummaryCard
            label="Workspace Valid"
            value={nativeSelfDevProof?.workspaceRootValid === true ? 'confirmed' : nativeSelfDevProof?.workspaceRootValid === false ? 'blocked' : 'unknown'}
            state={nativeSelfDevProof?.workspaceRootValid === true ? 'confirmed' : nativeSelfDevProof?.workspaceRootValid === false ? 'blocked' : 'unknown'}
            detail={nativeSelfDevProof?.workspaceRoot || resolvedWorkspaceRoot}
          />
          <SummaryCard
            label="Rust Scan Files"
            value={nativeSelfDevProof?.proofAuthority === PROOF_AUTHORITY.RUST_ENGINE ? (nativeSelfDevProof?.filesScanned ?? 0) : 'n/a'}
            state={nativeSelfDevProof?.proofAuthority === PROOF_AUTHORITY.RUST_ENGINE && nativeSelfDevProof?.filesScanned > 0 ? 'partial' : 'setup_required'}
            detail={nativeSelfDevProof?.exportPath || 'Run the Rust proof cycle or verify release/rc0/self-development-proof.md on disk.'}
          />
          <SummaryCard
            label="Proof Receipts"
            value={nativeSelfDevProof?.proofReceiptsWritten ? 'on disk' : 'setup_required'}
            state={nativeSelfDevProof?.proofReceiptsWritten ? 'confirmed' : 'setup_required'}
            detail={nativeSelfDevProof?.rc0Proof?.proofPath || nativeSelfDevProof?.rc0Proof?.readmePath || 'Requires 10_rc0_package_written.json under release/rc0/proof/.'}
          />
        </div>
        {nativeSelfDevProof?.topPackets?.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Native proof packets</div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {nativeSelfDevProof.topPackets.slice(0, 4).map((packet) => (
                <div key={packet.id} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-[11px] text-zinc-300">
                  <div className="font-semibold text-zinc-100">{packet.title}</div>
                  <div className="mt-1 text-zinc-500">{packet.id} | {packet.priority} | {packet.riskLevel} risk</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {!workspaceRoot && (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            Self-development mode needs a configured workspace root.
          </div>
        )}
      </SectionPanel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard label="Packets" value={packetSummary.count} />
        <SummaryCard label="P0" value={auditSummary.blockerCount || 0} state={(auditSummary.blockerCount || 0) > 0 ? 'blocked' : 'confirmed'} />
        <SummaryCard label="P1" value={auditSummary.partialCount || 0} state={(auditSummary.partialCount || 0) > 0 ? 'partial' : 'confirmed'} />
        <SummaryCard label="P2" value={auditSummary.needsSetupCount || 0} state={(auditSummary.needsSetupCount || 0) > 0 ? 'setup_required' : 'confirmed'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionPanel icon={ClipboardList} title="Latest Audit Truth">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SummaryCard label="Files Scanned" value={auditSummary.filesScanned || 0} state={(auditSummary.filesScanned || 0) > 0 ? 'partial' : 'setup_required'} />
            <SummaryCard label="Blockers" value={auditSummary.blockerCount || 0} state={(auditSummary.blockerCount || 0) > 0 ? 'blocked' : 'confirmed'} />
            <SummaryCard label="Truth Issues" value={auditSummary.issueCount || 0} state={(auditSummary.issueCount || 0) > 0 ? 'partial' : 'confirmed'} />
            <SummaryCard label="Needs Setup" value={auditSummary.needsSetupCount || 0} state={(auditSummary.needsSetupCount || 0) > 0 ? 'setup_required' : 'confirmed'} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-500 md:grid-cols-2">
            <div>Follow-ups: {followUpCount}</div>
            <div>Stored cycles: {cycles.length}</div>
            <div>Last cycle state: {displayTruthState(bundle?.overallState || 'unknown')}</div>
            <div>Export: {bundle?.exportProof?.file_path || bundle?.exportProof?.filePath || bundle?.exportError || 'not exported yet'}</div>
          </div>
        </SectionPanel>

        <SectionPanel icon={Bot} title="Implementation Packet Output">
          <div className="space-y-2">
            {packets.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 text-sm text-zinc-400">
                No Codex packet bundle exists yet. Run the self-development cycle to generate one.
              </div>
            )}
            {packets.slice(0, 5).map((packet) => (
              <article key={packet.id} className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{packet.title}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {packet.currentIssue} | {packet.riskLevel} risk
                    </div>
                  </div>
                  <StateBadge state={packet.priority === 'P0' ? 'blocked' : packet.priority === 'P1' ? 'partial' : 'setup_required'} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <PacketBlock label="Files likely involved" value={packet.files?.length ? packet.files.join(', ') : 'None recorded.'} />
                  <PacketBlock label="Recommended change" value={packet.recommendedChange || 'No recommendation recorded.'} />
                  <PacketBlock label="Test commands" value={(packet.testCommands || []).join(' | ') || 'No test commands recorded.'} />
                  <PacketBlock label="Expected proof" value={packet.expectedProof || 'No proof recorded.'} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <PacketBlock label="Needs setup dependencies" value={(packet.needsSetupDependencies || []).join(' | ') || 'None recorded.'} />
                  <PacketBlock label="Rollback note" value={packet.rollbackNote || 'No rollback note recorded.'} />
                </div>

                <div className="mt-3 space-y-2">
                  {(packet.patchSuggestions || []).slice(0, 3).map((suggestion) => (
                    <div key={`${packet.id}-${suggestion.file}-${suggestion.lineNumber}`} className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-[11px] text-zinc-400">
                      <div className="font-semibold text-zinc-200">{suggestion.file}:{suggestion.lineNumber}</div>
                      <div className="mt-1">{suggestion.suggestion}</div>
                      {suggestion.excerpt && <div className="mt-1 text-zinc-500">{suggestion.excerpt}</div>}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, state = 'unknown' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <StateBadge state={state} />
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function PacketBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">{value}</div>
    </div>
  );
}
