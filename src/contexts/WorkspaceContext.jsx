import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  buildWorkspaceSymbolIndex,
  checkOcrCapability,
  collectWorkspaceProof,
  getWorkspaceFoundation,
  runOcrAdapter,
  updateWorkspaceFoundation
} from '../services/workspaceIntelligenceService';
import { TRUST_STATES } from '../services/trustModel';
import { appendVerificationLog, readDurableAuditLog } from '../services/verificationService';
import { AUDIT_LOG_FETCH_LIMIT, VERIFICATION_LOG_CAP, SYMBOL_INDEX_FILE_LIMIT } from '../constants/appConstants';
import { useSettings } from './SettingsContext';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children, requestApproval, setVerificationLogs, setDurableAuditLogs }) {
  const { settings } = useSettings();
  const [workspaceFoundation, setWorkspaceFoundation] = useState(() => getWorkspaceFoundation());
  const [workspaceProof, setWorkspaceProof] = useState(null);
  const [ocrCapability, setOcrCapability] = useState(null);
  const [workspaceSymbolIndex, setWorkspaceSymbolIndex] = useState(null);
  const [lastOcrAdapterRun, setLastOcrAdapterRun] = useState(null);

  const handleRunWorkspaceProof = useCallback(async () => {
    if (!settings.workspaceRoot) {
      const log = appendVerificationLog({
        type: 'workspace_proof', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: 'Workspace root is not set.' }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      return;
    }
    if (!await requestApproval(`Collect workspace proof for ${settings.workspaceRoot}`)) return;
    try {
      const proof = await collectWorkspaceProof(settings.workspaceRoot, 1200);
      setWorkspaceProof(proof);
      const log = appendVerificationLog({
        type: 'workspace_proof', source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY, payload: proof
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      setWorkspaceFoundation(updateWorkspaceFoundation({
        workspaceProof: { lastRunAt: Date.now(), trust: proof?.trust || TRUST_STATES.UNVERIFIED }
      }));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'workspace_proof', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [settings.workspaceRoot, requestApproval, setVerificationLogs, setDurableAuditLogs]);

  const handleCheckOcrCapability = useCallback(async () => {
    if (!await requestApproval('Check OCR engine capability')) return;
    try {
      const proof = await checkOcrCapability(settings.ocrEnginePath);
      setOcrCapability(proof);
      const log = appendVerificationLog({
        type: 'ocr_capability_check', source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.UNVERIFIED, payload: proof
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      setWorkspaceFoundation(updateWorkspaceFoundation({
        ocrCapability: {
          available: Boolean(proof?.available), engine: proof?.engine || 'unconfigured',
          message: proof?.message || '', checkedAtMs: proof?.checked_at_ms || Date.now(),
          verificationState: proof?.trust || TRUST_STATES.UNVERIFIED
        }
      }));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'ocr_capability_check', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [requestApproval, settings.ocrEnginePath, setVerificationLogs, setDurableAuditLogs]);

  const handleBuildSymbolIndex = useCallback(async () => {
    if (!settings.workspaceRoot) {
      const log = appendVerificationLog({
        type: 'symbol_index_build', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: 'Workspace root is not set.' }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      return;
    }
    if (!await requestApproval(`Build workspace symbol index for ${settings.workspaceRoot}`)) return;
    try {
      const index = await buildWorkspaceSymbolIndex(settings.workspaceRoot, SYMBOL_INDEX_FILE_LIMIT);
      setWorkspaceSymbolIndex(index);
      const log = appendVerificationLog({
        type: 'symbol_index_build', source: 'tauri-command',
        trust: index?.trust || TRUST_STATES.TEMPORARY,
        payload: { root: index?.root, filesIndexed: index?.files_indexed, totals: index?.totals }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'symbol_index_build', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [settings.workspaceRoot, requestApproval, setVerificationLogs, setDurableAuditLogs]);

  const handleRunOcrAdapter = useCallback(async ({ adapter, imagePath, extraArgs }) => {
    if (!settings.ocrEnginePath) {
      const log = appendVerificationLog({
        type: 'ocr_adapter_run', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: 'OCR engine path is not set.' }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      return;
    }
    if (!await requestApproval(`Run OCR adapter ${adapter}`)) return;
    try {
      const proof = await runOcrAdapter({
        adapter, enginePath: settings.ocrEnginePath, imagePath: imagePath || null, extraArgs
      });
      setLastOcrAdapterRun(proof);
      const log = appendVerificationLog({
        type: 'ocr_adapter_run', source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        payload: { adapter: proof?.adapter, success: proof?.success, exitCode: proof?.exit_code }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'ocr_adapter_run', source: 'tauri-command', trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [settings.ocrEnginePath, requestApproval, setVerificationLogs, setDurableAuditLogs]);

  const handleToggleWorkspaceFeature = useCallback((featureKey, enabled) => {
    const feature = workspaceFoundation[featureKey] || {};
    setWorkspaceFoundation(updateWorkspaceFoundation({
      [featureKey]: {
        ...feature, enabled,
        verificationState: enabled ? TRUST_STATES.TEMPORARY : TRUST_STATES.UNVERIFIED
      }
    }));
  }, [workspaceFoundation]);

  const value = useMemo(() => ({
    workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun,
    handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature
  }), [workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun,
    handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
