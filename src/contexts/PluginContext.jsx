import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  appendPluginAuditEntry,
  discoverDiskPluginManifests,
  executePluginToolRun,
  listPluginAudit,
  listPlugins,
  togglePlugin,
  validatePluginManifestDisk
} from '../services/pluginRegistryService';
import { evaluatePluginExecutionPolicy, getPluginSandboxPolicy, updatePluginSandboxPolicy } from '../services/pluginSandboxService';
import { TRUST_STATES, timestampMs } from '../services/trustModel';
import { appendVerificationLog, readDurableAuditLog } from '../services/verificationService';
import { AUDIT_LOG_FETCH_LIMIT, VERIFICATION_LOG_CAP } from '../constants/appConstants';
import { useSettings } from './SettingsContext';

const PluginContext = createContext(null);

export function PluginProvider({ children, requestApproval, setVerificationLogs, setDurableAuditLogs, setApprovalRequiredNotice }) {
  const { settings } = useSettings();
  const [plugins, setPlugins] = useState(() => listPlugins());
  const [pluginAudit, setPluginAudit] = useState(() => listPluginAudit());
  const [pluginSandboxPolicy, setPluginSandboxPolicy] = useState(() => getPluginSandboxPolicy());
  const [diskPluginManifests, setDiskPluginManifests] = useState([]);
  const [lastPluginToolRun, setLastPluginToolRun] = useState(null);
  const [lastManifestValidation, setLastManifestValidation] = useState(null);

  const handleTogglePlugin = useCallback(async (pluginId, enabled) => {
    if (!await requestApproval(`${enabled ? 'Enable' : 'Disable'} plugin: ${pluginId}`)) return;
    setPlugins(togglePlugin(pluginId, enabled));
    setPluginAudit(listPluginAudit());
  }, [requestApproval]);

  const handleDiscoverPlugins = useCallback(async () => {
    if (!await requestApproval('Discover plugin manifests from disk')) return;
    const manifests = await discoverDiskPluginManifests(settings.workspaceRoot);
    setDiskPluginManifests(manifests);
    const log = appendVerificationLog({
      type: 'plugin_manifest_scan',
      source: 'tauri-command',
      trust: TRUST_STATES.VERIFIED,
      payload: {
        workspaceRoot: settings.workspaceRoot || null,
        count: manifests.length
      }
    });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [requestApproval, settings.workspaceRoot, setVerificationLogs, setDurableAuditLogs]);

  const handleValidatePluginManifest = useCallback(async (manifestPath) => {
    if (!manifestPath) return;
    if (!await requestApproval(`Validate plugin manifest ${manifestPath}`)) return;
    try {
      const validation = await validatePluginManifestDisk(manifestPath);
      setLastManifestValidation(validation);
      const log = appendVerificationLog({
        type: 'plugin_manifest_validation',
        source: 'tauri-command',
        trust: validation?.trust || TRUST_STATES.TEMPORARY,
        payload: validation
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      appendPluginAuditEntry({
        pluginId: 'manifest_validation',
        action: validation?.valid ? 'manifest_valid' : 'manifest_invalid',
        trust: validation?.trust || TRUST_STATES.TEMPORARY,
        details: {
          manifestPath,
          errors: validation?.errors || [],
          warnings: validation?.warnings || []
        }
      });
      setPluginAudit(listPluginAudit());
    } catch (error) {
      const log = appendVerificationLog({
        type: 'plugin_manifest_validation',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      appendPluginAuditEntry({
        pluginId: 'manifest_validation',
        action: 'manifest_validation_error',
        trust: TRUST_STATES.FAILED,
        details: { manifestPath, error: String(error) }
      });
      setPluginAudit(listPluginAudit());
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [requestApproval, setVerificationLogs, setDurableAuditLogs]);

  const handleExecutePluginTool = useCallback(async ({ manifestPath, pluginId, toolId, extraArgs }) => {
    const policyCheck = evaluatePluginExecutionPolicy({ manifestPath, pluginId, toolId, extraArgs });
    if (!policyCheck.allowed) {
      const log = appendVerificationLog({
        type: 'plugin_tool_execution_blocked',
        source: 'plugin-sandbox-policy',
        trust: TRUST_STATES.FAILED,
        payload: policyCheck
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      appendPluginAuditEntry({
        pluginId: pluginId || 'unknown',
        action: 'tool_execution_blocked_local_policy',
        trust: TRUST_STATES.FAILED,
        details: { toolId: toolId || '', violations: policyCheck?.violations || [] }
      });
      setPluginAudit(listPluginAudit());
      setApprovalRequiredNotice(true);
      return;
    }

    if (pluginSandboxPolicy.requireManifestValidation) {
      try {
        const validation = await validatePluginManifestDisk(manifestPath);
        setLastManifestValidation(validation);
        if (!validation.valid) {
          const log = appendVerificationLog({
            type: 'plugin_manifest_validation_blocked',
            source: 'plugin-sandbox-policy',
            trust: TRUST_STATES.FAILED,
            payload: validation
          });
          setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
          appendPluginAuditEntry({
            pluginId: pluginId || 'unknown',
            action: 'manifest_validation_blocked',
            trust: TRUST_STATES.FAILED,
            details: { toolId: toolId || '', errors: validation?.errors || [], warnings: validation?.warnings || [] }
          });
          setPluginAudit(listPluginAudit());
          setApprovalRequiredNotice(true);
          return;
        }
      } catch (error) {
        const log = appendVerificationLog({
          type: 'plugin_manifest_validation_blocked',
          source: 'plugin-sandbox-policy',
          trust: TRUST_STATES.FAILED,
          payload: { error: String(error) }
        });
        setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
        appendPluginAuditEntry({
          pluginId: pluginId || 'unknown',
          action: 'manifest_validation_failed',
          trust: TRUST_STATES.FAILED,
          details: { toolId: toolId || '', error: String(error) }
        });
        setPluginAudit(listPluginAudit());
        setApprovalRequiredNotice(true);
        return;
      }
    }

    if (!await requestApproval(`Execute plugin tool ${pluginId}:${toolId}`)) return;
    try {
      const proof = await executePluginToolRun({
        manifestPath, pluginId, toolId, extraArgs, workspaceRoot: settings.workspaceRoot
      });
      setLastPluginToolRun(proof);
      const log = appendVerificationLog({
        type: 'plugin_tool_execution',
        source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        payload: { pluginId: proof?.plugin_id, toolId: proof?.tool_id, success: proof?.success, exitCode: proof?.exit_code }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      appendPluginAuditEntry({
        pluginId: proof?.plugin_id || pluginId || 'unknown',
        action: proof?.success ? 'tool_execution_success' : 'tool_execution_failed',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        details: { toolId: proof?.tool_id || toolId || '', exitCode: proof?.exit_code ?? null }
      });
      setPluginAudit(listPluginAudit());
    } catch (error) {
      const log = appendVerificationLog({
        type: 'plugin_tool_execution',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: { error: String(error) }
      });
      setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
      appendPluginAuditEntry({
        pluginId: pluginId || 'unknown',
        action: 'tool_execution_error',
        trust: TRUST_STATES.FAILED,
        details: { toolId: toolId || '', error: String(error) }
      });
      setPluginAudit(listPluginAudit());
    }
    setDurableAuditLogs(await readDurableAuditLog(AUDIT_LOG_FETCH_LIMIT));
  }, [requestApproval, settings.workspaceRoot, pluginSandboxPolicy.requireManifestValidation, setVerificationLogs, setDurableAuditLogs, setApprovalRequiredNotice]);

  const handleUpdatePluginSandboxPolicy = useCallback((patch) => {
    const next = updatePluginSandboxPolicy(patch);
    setPluginSandboxPolicy(next);
    const log = appendVerificationLog({
      type: 'plugin_sandbox_policy_update',
      source: 'operator-dashboard',
      trust: TRUST_STATES.VERIFIED,
      payload: next
    });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
  }, [setVerificationLogs]);

  const value = useMemo(() => ({
    plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation,
    handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy
  }), [plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation,
    handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy]);

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  );
}

export function usePlugins() {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error('usePlugins must be used within PluginProvider');
  return ctx;
}
