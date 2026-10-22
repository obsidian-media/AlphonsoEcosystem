import React, { createContext, useCallback, useContext, useMemo } from 'react';
import {
  appendVerificationLog,
  readDurableAuditLog,
  verifyCommandExecution,
  verifyDurableAuditChain,
  verifyOllamaRuntimeProof,
  verifyPathProof,
  verifyProcessProof
} from '../services/verificationService';
import { TRUST_STATES } from '../services/trustModel';
import { assessCommandRisk } from '../services/commandApprovalService';
import { AUDIT_LOG_FETCH_LIMIT, VERIFICATION_LOG_CAP } from '../constants/appConstants';
import { useSettings } from './SettingsContext';
import { useOllama } from './OllamaContext';

const VerificationContext = createContext(null);

export function VerificationProvider({ children, requestApproval, setApprovalRequiredNotice, verificationLogs, setVerificationLogs, durableAuditLogs, setDurableAuditLogs, auditChainProof, setAuditChainProof }) {
  const { settings } = useSettings();
  const { runOllamaCheck } = useOllama();

  const verifyOllamaWithProof = useCallback(async () => {
    if (!await requestApproval({ actionLabel: 'Run Ollama runtime verification' })) return;
    await runOllamaCheck();
    const proof = await verifyOllamaRuntimeProof(settings.endpoint);
    setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval, runOllamaCheck, settings.endpoint]);

  const verifyProcesses = useCallback(async (names) => {
    if (!await requestApproval({ actionLabel: `Check process state: ${names.join(', ')}` })) return;
    const proof = await verifyProcessProof(names);
    setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval]);

  const verifyPaths = useCallback(async (paths) => {
    if (!await requestApproval({ actionLabel: `Verify filesystem paths: ${paths.join(', ')}` })) return;
    const proof = await verifyPathProof(paths);
    setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval]);

  const verifyAuditChain = useCallback(async () => {
    if (!await requestApproval({ actionLabel: 'Verify durable audit chain integrity' })) return;
    const proof = await verifyDurableAuditChain();
    setAuditChainProof(proof?.payload || null);
    setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [requestApproval]);

  const verifyCommand = useCallback(async (program, args, description = '') => {
    if (!program) return;
    if (settings.safeMode) {
      const safePrograms = ['ollama', 'where', 'where.exe', 'tasklist', 'npm', 'npm.cmd'];
      if (!safePrograms.includes(program.toLowerCase())) {
        const log = appendVerificationLog({
          type: 'command_blocked_safe_mode', source: 'frontend-policy',
          trust: TRUST_STATES.VERIFIED, payload: { program, reason: 'Blocked by safe mode policy' }
        });
        setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
        setApprovalRequiredNotice(true);
        return;
      }
    }
    // The rating comes from what the command does (owner, 2026-10-22: every
    // command used to be "high, 85"). Read-only commands run without asking.
    const risk = assessCommandRisk(program, args);
    if (!risk.readOnly) {
      const actionLabel = description || `Run command: ${program} ${args.join(' ')}`;
      if (!await requestApproval({ actionLabel, riskLevel: risk.level, riskReasons: risk.reasons, requireApproval: true })) return;
    }
    const proof = await verifyCommandExecution(program, args, null);
    setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
  }, [settings.safeMode, requestApproval, setApprovalRequiredNotice]);

  const handleRunReleasePreflight = useCallback(async () => {
    // One approval, asked by verifyCommand with the command's own rating
    // (it used to ask twice).
    await verifyCommand('npm.cmd', ['run', 'verify:desktop'], 'Run release preflight (tests, web build and desktop build): npm run verify:desktop');
  }, [requestApproval, verifyCommand]);

  const handleRuntimeRepair = useCallback(async () => {
    // These checks only read (is Ollama answering, is its process running), so
    // they no longer ask for approval (owner, 2026-10-22).
    await runOllamaCheck();
    await verifyProcesses(['ollama']);
    const log = appendVerificationLog({
      type: 'runtime_repair', source: 'supervised-repair', trust: TRUST_STATES.TEMPORARY,
      payload: { status: 'repair checks completed' }
    });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval, runOllamaCheck, verifyProcesses]);

  const value = useMemo(() => ({
    verificationLogs, setVerificationLogs, durableAuditLogs, setDurableAuditLogs, auditChainProof,
    verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand,
    handleRunReleasePreflight, handleRuntimeRepair
  }), [verificationLogs, durableAuditLogs, auditChainProof,
    verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand,
    handleRunReleasePreflight, handleRuntimeRepair]);

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification() {
  const ctx = useContext(VerificationContext);
  if (!ctx) throw new Error('useVerification must be used within VerificationProvider');
  return ctx;
}
