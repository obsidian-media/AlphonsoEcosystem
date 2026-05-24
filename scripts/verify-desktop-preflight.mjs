import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_ROOT = process.cwd();
const WINDOWS_WIX_CANDIDATES = [
  process.env.WIX,
  process.env.WIX_HOME,
  'C:\\Program Files (x86)\\WiX Toolset v3.14\\bin',
  'C:\\Program Files\\WiX Toolset v3.14\\bin'
].filter(Boolean);

function hasWixBinaries(root) {
  return existsSync(join(root, 'candle.exe')) && existsSync(join(root, 'light.exe'));
}

export function checkDesktopPreflight() {
  for (const root of WINDOWS_WIX_CANDIDATES) {
    if (hasWixBinaries(root)) {
      return {
        ok: true,
        state: 'ready',
        toolRoot: root,
        hardPrecondition: 'WiX 3.14 binaries available locally'
      };
    }
  }

  return {
    ok: false,
    state: 'setup_required',
    toolRoot: null,
    hardPrecondition: 'WiX 3.14 binaries available locally or outbound network access allowed for wix314-binaries.zip',
    checkedRoots: WINDOWS_WIX_CANDIDATES,
    projectRoot: PROJECT_ROOT
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = checkDesktopPreflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
}
