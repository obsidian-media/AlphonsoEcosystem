import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from '../services/trustModel';
import { PROOF_AUTHORITY } from '../services/serviceScopes';
import { getDefaultWorkspaceRoot } from '../services/workspaceRootService';
import { runSelfDevelopmentCycle } from '../services/selfDevelopmentService';

export function useNativeProofEffects({
  settings,
  desktopBridge,
  updateCheckState,
  workspaceFoundation,
  nativeProofHooks,
  writeNativeProofStage,
  nativeSelfDevAutorunRef,
  setNativeSelfDevProof
}) {
  // Frontend loaded proof
  useEffect(() => {
    void writeNativeProofStage('04_frontend_loaded.json', {
      status: 'running',
      processId: null,
      workspaceRoot: settings.workspaceRoot || getDefaultWorkspaceRoot(),
      note: 'React frontend mounted in the native runtime.'
    });
  }, [settings.workspaceRoot, writeNativeProofStage]);

  // Native self-development proof autorun
  useEffect(() => {
    let cancelled = false;

    if (window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__) {
      return () => { cancelled = true; };
    }

    async function runNativeSelfDevelopmentProof() {
      if (nativeSelfDevAutorunRef.current) return;

      const proofWorkspaceRoot = settings.workspaceRoot || getDefaultWorkspaceRoot();
      let rc0ProofValue = null;
      try {
        const rc0Proof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_RC0_PROOF' });
        rc0ProofValue = String(rc0Proof?.value || '').trim();
      } catch {
        rc0ProofValue = null;
      }
      if (rc0ProofValue === '1') {
        nativeSelfDevAutorunRef.current = true;
        window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
        if (!cancelled) {
          setNativeSelfDevProof({
            runtime: 'native_tauri',
            proofAuthority: PROOF_AUTHORITY.RUST_ENGINE,
            proofMode: 'native_rc0_rust',
            autorun: false,
            state: 'partial',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: null,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            note: 'Rust RC0 engine is proof authority. Verify release/rc0/proof/*.json on disk; React display is not proof.'
          });
        }
        return;
      }

      nativeSelfDevAutorunRef.current = true;
      window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
      await writeNativeProofStage('05_autorun_observer_started.json', {
        status: 'running',
        workspaceRoot: proofWorkspaceRoot,
        note: 'Native autorun observer entered before env reads; React is not proof authority.'
      });

      let autorunValue = null;
      let exitValue = null;
      try {
        const autorunProof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_SELFDEV_AUTORUN' });
        autorunValue = String(autorunProof?.value || '').trim();
      } catch {
        autorunValue = null;
      }
      try {
        const exitProof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_SELFDEV_EXIT_ON_COMPLETE' });
        exitValue = String(exitProof?.value || '').trim();
      } catch {
        exitValue = null;
      }
      await writeNativeProofStage('05_autorun_observer_env_checked.json', {
        status: autorunValue === '1' ? 'ready' : 'setup_required',
        workspaceRoot: proofWorkspaceRoot,
        note: autorunValue === '1'
          ? 'Autorun env detected by the native proof observer.'
          : 'Autorun env not enabled or not readable in the native proof observer.',
        autorunValue: autorunValue === '1',
        exitValue: exitValue === '1'
      });

      if (autorunValue !== '1') {
        if (!cancelled) {
          setNativeSelfDevProof({
            runtime: 'native_tauri',
            proofMode: 'automated_native',
            autorun: false,
            state: 'setup_required',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: null,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            note: 'ALPHONSO_SELFDEV_AUTORUN is not enabled in this native runtime.'
          });
          await invoke('write_workspace_text_file', {
            workspaceRoot: proofWorkspaceRoot,
            relativePath: 'release/rc0/native-selfdev-skipped.json',
            content: JSON.stringify({
              runtime: 'native_tauri',
              proofMode: 'automated_native',
              state: 'setup_required',
              autorun: false,
              workspaceRoot: proofWorkspaceRoot,
              timestampMs: timestampMs(),
              note: 'ALPHONSO_SELFDEV_AUTORUN is not enabled in this native runtime.'
            }, null, 2)
          }).catch(() => {});
        }
        return;
      }

      if (!cancelled) {
        setNativeSelfDevProof({
          runtime: 'native_tauri',
          proofMode: 'automated_native',
          autorun: true,
          state: 'running',
          workspaceRoot: settings.workspaceRoot || getDefaultWorkspaceRoot(),
          workspaceRootValid: null,
          filesScanned: 0,
          p0Count: 0,
          p1Count: 0,
          p2Count: 0,
          exportPath: null,
          proofReceiptsWritten: false,
          timestampMs: timestampMs(),
          note: exitValue === '1' ? 'Native proof will exit after completion if safe.' : 'Native proof will leave the app open after completion.'
        });
        await invoke('write_workspace_text_file', {
          workspaceRoot: proofWorkspaceRoot,
          relativePath: 'release/rc0/native-selfdev-started.json',
          content: JSON.stringify({
            runtime: 'native_tauri',
            state: 'running',
            autorun: true,
            workspaceRoot: proofWorkspaceRoot,
            timestampMs: timestampMs(),
            exitOnComplete: exitValue === '1'
          }, null, 2)
        }).catch(() => {});
      }

      try {
        await writeNativeProofStage('05_autorun_observer_triggered.json', {
          status: 'running',
          workspaceRoot: proofWorkspaceRoot,
          note: 'Native autorun observer branch reached before workspace validation.'
        });
        const cycle = await runSelfDevelopmentCycle({
          root: proofWorkspaceRoot,
          settings,
          updateCheckState,
          verificationLogs: [],
          workspaceFoundation,
          proofHooks: nativeProofHooks
        });
        if (cancelled) return;
        const nextProof = {
          runtime: 'native_tauri',
          proofAuthority: PROOF_AUTHORITY.JS_BRIDGE,
          proofMode: 'automated_native',
          autorun: true,
          state: 'partial',
          workspaceRoot: cycle?.root || settings.workspaceRoot || getDefaultWorkspaceRoot(),
          workspaceRootValid: Boolean(cycle?.validation?.ok),
          filesScanned: Number(cycle?.auditSummary?.filesScanned || 0),
          p0Count: Number(cycle?.auditSummary?.blockerCount || 0),
          p1Count: Number(cycle?.readinessSummary?.partialCount || 0),
          p2Count: Number(cycle?.readinessSummary?.needsSetupCount || 0),
          topPackets: Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map((packet) => ({
            id: packet.id,
            title: packet.title,
            priority: packet.priority,
            riskLevel: packet.riskLevel
          })) : [],
          exportPath: cycle?.exportProof?.file_path || cycle?.exportProof?.filePath || null,
          proofReceiptsWritten: false,
          rc0Proof: cycle?.rc0Proof || null,
          timestampMs: cycle?.generatedAtMs || timestampMs(),
          note: cycle?.rc0Error
            ? `JS bridge RC0 export error: ${cycle.rc0Error}`
            : 'JS bridge scan recorded. Rust RC0 engine and release/rc0/proof/*.json remain proof authority.'
        };
        setNativeSelfDevProof(nextProof);
        await invoke('write_workspace_text_file', {
          workspaceRoot: proofWorkspaceRoot,
          relativePath: 'release/rc0/native-selfdev-complete.json',
          content: JSON.stringify(nextProof, null, 2)
        }).catch(() => {});
      } catch (error) {
        if (!cancelled) {
          const failedProof = {
            runtime: 'native_tauri',
            proofMode: 'automated_native',
            autorun: true,
            state: 'failed',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: false,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            error: String(error)
          };
          setNativeSelfDevProof(failedProof);
          await invoke('write_workspace_text_file', {
            workspaceRoot: proofWorkspaceRoot,
            relativePath: 'release/rc0/native-selfdev-error.json',
            content: JSON.stringify(failedProof, null, 2)
          }).catch(() => {});
        }
      }
    }

    void runNativeSelfDevelopmentProof();
    return () => { cancelled = true; };
  }, [desktopBridge.state, nativeProofHooks, settings.workspaceRoot, updateCheckState, workspaceFoundation]);
}
