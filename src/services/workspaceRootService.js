import { invoke } from '@tauri-apps/api/core';

export const CURRENT_WORKSPACE_ROOT = 'C:/Users/Shaya/OneDrive/Desktop/ALPHONSO/FILES/local-agent-ui-v2';

const REQUIRED_ENTRIES = [
  'package.json',
  'src',
  'src-tauri',
  'docs'
];

export function getDefaultWorkspaceRoot() {
  return CURRENT_WORKSPACE_ROOT;
}

export async function validateWorkspaceRoot(root) {
  const cleanRoot = String(root || '').trim();
  if (!cleanRoot) {
    return {
      ok: false,
      status: 'setup_required',
      root: '',
      exists: false,
      requiredEntries: REQUIRED_ENTRIES.map((entry) => ({ path: entry, exists: false })),
      missingEntries: REQUIRED_ENTRIES.slice(),
      trust: 'unverified',
      error: 'Workspace root is not configured.'
    };
  }

  const paths = [cleanRoot, ...REQUIRED_ENTRIES.map((entry) => `${cleanRoot}/${entry}`)];
  const proofs = await invoke('verify_paths', { paths });
  const rootProof = Array.isArray(proofs) ? proofs[0] : null;
  const entryProofs = Array.isArray(proofs) ? proofs.slice(1) : [];
  const missingEntries = REQUIRED_ENTRIES.filter((_, index) => !entryProofs[index]?.exists);
  const exists = Boolean(rootProof?.exists && rootProof?.is_dir);
  const ok = exists && missingEntries.length === 0;

  return {
    ok,
    status: ok ? 'ready' : exists ? 'setup_required' : 'blocked',
    root: cleanRoot,
    exists,
    isDir: Boolean(rootProof?.is_dir),
    requiredEntries: REQUIRED_ENTRIES.map((entry, index) => ({
      path: entry,
      exists: Boolean(entryProofs[index]?.exists),
      isFile: Boolean(entryProofs[index]?.is_file),
      isDir: Boolean(entryProofs[index]?.is_dir)
    })),
    missingEntries,
    trust: ok ? 'verified' : 'unverified',
    error: ok ? null : missingEntries.length > 0 ? `Missing expected workspace entries: ${missingEntries.join(', ')}` : 'Workspace root path does not exist or is not a directory.'
  };
}

