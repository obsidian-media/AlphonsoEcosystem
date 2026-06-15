import { useEffect } from 'react';
import { hydrateMemoryFromDurable, listMemoryItems } from '../services/memoryService';
import { discoverDiskPluginManifests, listPlugins, listPluginAudit } from '../services/pluginRegistryService';
import { readDurableAuditLog } from '../services/verificationService';
import { bootstrapRuntimeLedgerHydration } from '../services/runtimeLedgerService';
import { getVerificationLogs } from '../services/verificationService';
import {
  PACKET_SCOPE,
  JOSE_COMMAND_SCOPE,
  SESSION_EVENT_SCOPE,
  GOVERNANCE_SCOPE,
  ORCHESTRATION_RECEIPT_SCOPE,
  ORCHESTRATION_QUEUE_SCOPE,
  VERIFICATION_SCOPE,
  CONNECTOR_SCOPE,
  CONNECTOR_AUDIT_SCOPE,
  CONNECTOR_AUTH_SCOPE,
  TOOL_CONNECTION_SCOPE,
  TOOL_CONNECTION_AUDIT_SCOPE,
  MIYA_MEMORY_SCOPE,
  PLUGINS_SCOPE,
  PLUGIN_AUDIT_SCOPE,
  REPO_AUDIT_SCOPE,
  PRODUCTION_READINESS_SCOPE,
  DEV_PACKET_SCOPE,
  SELF_DEVELOPMENT_SCOPE,
  WORKFLOW_OPS_SCOPE,
  WORKFLOW_RUN_SCOPE,
  WORKFLOW_RECEIPT_SCOPE,
  WORKFLOW_TELEMETRY_SCOPE,
  AGENT_OUTPUT_SCOPE,
  NOVA_SCORE_SCOPE
} from '../services/serviceScopes';

export function useDataHydration({
  settings,
  desktopBridge,
  isCoachWindow,
  setVerificationLogs,
  setDurableAuditLogs,
  setDiskPluginManifests,
  setMemoryItems,
  setPlugins,
  setPluginAudit
}) {
  // Supervised state loading
  useEffect(() => {
    let cancelled = false;

    const loadSupervisedState = async () => {
      const [audit, manifests] = await Promise.all([
        readDurableAuditLog(200),
        discoverDiskPluginManifests(settings.workspaceRoot)
      ]);

      if (cancelled) return;
      setDurableAuditLogs(Array.isArray(audit) ? audit : []);
      setDiskPluginManifests(Array.isArray(manifests) ? manifests : []);
    };

    loadSupervisedState();
    return () => { cancelled = true; };
  }, [settings.workspaceRoot, setDurableAuditLogs, setDiskPluginManifests]);

  // Memory hydration from durable
  useEffect(() => {
    let cancelled = false;
    if (isCoachWindow) return undefined;

    const hydrate = async () => {
      const durableRows = await hydrateMemoryFromDurable();
      if (!cancelled && Array.isArray(durableRows) && durableRows.length) {
        setMemoryItems(durableRows);
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, [desktopBridge.state, isCoachWindow, setMemoryItems]);

  // Runtime ledger hydration
  useEffect(() => {
    let cancelled = false;
    if (isCoachWindow) return undefined;

    const hydrateRuntimeLedgers = async () => {
      const proof = await bootstrapRuntimeLedgerHydration([
        { scope: PACKET_SCOPE, storageKey: 'alphonso_agent_bus_packets_v1' },
        { scope: JOSE_COMMAND_SCOPE, storageKey: 'alphonso_jose_command_routes_v2' },
        { scope: SESSION_EVENT_SCOPE, storageKey: 'alphonso_session_events_v1' },
        { scope: GOVERNANCE_SCOPE, storageKey: 'alphonso_jose_governance_decisions_v1' },
        { scope: ORCHESTRATION_RECEIPT_SCOPE, storageKey: 'alphonso_orchestration_receipts_v1' },
        { scope: ORCHESTRATION_QUEUE_SCOPE, storageKey: 'alphonso_orchestration_queue_transitions_v1' },
        { scope: VERIFICATION_SCOPE, storageKey: 'alphonso_verification_logs_v1' },
        { scope: CONNECTOR_SCOPE, storageKey: 'alphonso_connector_registry_v2' },
        { scope: CONNECTOR_AUDIT_SCOPE, storageKey: 'alphonso_connector_audit_v2' },
        { scope: CONNECTOR_AUTH_SCOPE, storageKey: 'alphonso_connector_auth_profiles_v1' },
        { scope: TOOL_CONNECTION_SCOPE, storageKey: 'alphonso_tool_connections_v1' },
        { scope: TOOL_CONNECTION_AUDIT_SCOPE, storageKey: 'alphonso_tool_connection_audit_v1' },
        { scope: MIYA_MEMORY_SCOPE, storageKey: 'alphonso_miya_memory_v1' },
        { scope: PLUGINS_SCOPE, storageKey: 'alphonso_plugins_v1' },
        { scope: PLUGIN_AUDIT_SCOPE, storageKey: 'alphonso_plugin_audit_v1' },
        { scope: REPO_AUDIT_SCOPE, storageKey: 'alphonso_repo_audits_v1' },
        { scope: PRODUCTION_READINESS_SCOPE, storageKey: 'alphonso_production_readiness_v1' },
        { scope: DEV_PACKET_SCOPE, storageKey: 'alphonso_dev_packets_v1' },
        { scope: SELF_DEVELOPMENT_SCOPE, storageKey: 'alphonso_self_development_cycles_v1' },
        { scope: WORKFLOW_OPS_SCOPE, storageKey: 'alphonso_workflow_operations_registry_v1' },
        { scope: WORKFLOW_RUN_SCOPE, storageKey: 'alphonso_workflow_runs_v1' },
        { scope: WORKFLOW_RECEIPT_SCOPE, storageKey: 'alphonso_workflow_receipts_v1' },
        { scope: WORKFLOW_TELEMETRY_SCOPE, storageKey: 'alphonso_workflow_telemetry_v1' },
        { scope: AGENT_OUTPUT_SCOPE, storageKey: 'alphonso_agent_outputs_v1' },
        { scope: NOVA_SCORE_SCOPE, storageKey: 'alphonso_nova_scores_v1' }
      ]);
      if (cancelled || !proof?.available) return;
      setVerificationLogs(getVerificationLogs());
      setPlugins(listPlugins());
      setPluginAudit(listPluginAudit());
      setMemoryItems(listMemoryItems());
    };

    hydrateRuntimeLedgers();
    return () => { cancelled = true; };
  }, [desktopBridge.state, isCoachWindow, setVerificationLogs, setPlugins, setPluginAudit, setMemoryItems]);
}
