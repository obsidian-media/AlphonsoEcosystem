# Smart Installer ("Ritual Installer") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `OnboardingWizard.tsx`'s first-run flow with an intent-first "Setup" experience — hardware scan, plain-language intent picker, a smart recommendation combining both, a parallel install queue with an early-exit path to chat, and a themed activation sequence — using the app's existing first-run gating mechanism rather than a new window or binary.

**Architecture:** Same Tauri binary, same window. Setup reuses the exact gating pattern `OnboardingWizard.tsx` already uses today (`showOnboarding` state seeded from a `localStorage` flag, top-level conditional render in `App.tsx` that replaces the whole app shell). New Rust code is limited to hardware detection (RAM/disk/GPU — nothing today covers this); every install action reuses the existing `runtimeManagerService.ts` functions (`installTool`, `installPrerequisite`, `checkPrerequisites`, `getAllStatus`) unchanged.

**Tech Stack:** Tauri v2 (Rust backend), React 18 + TypeScript (frontend), Vitest (frontend tests), Rust's built-in `#[cfg(test)]` (backend tests), `sysinfo` crate (new dependency, RAM/disk detection).

**Full design reference:** `docs/superpowers/specs/2026-09-07-smart-installer-design.md` — read this first for the *why* behind every decision below; this plan only covers the *how*.

**Scope of this plan:** the full v1 flow (Windows + Linux, per the design doc's platform decision) through Launch. Visual polish (exact Framer Motion choreography, full Cyberpunk Ritual styling, `prefers-reduced-motion`, screen-reader pass) is explicitly deferred per the design doc's own §9 — this plan builds functionally-correct, accessibly-reasonable, plainly-styled screens using the app's existing design tokens and `ui/` component barrel, not a finished visual pass.

---

## Task 1: Hardware detection — RAM and disk (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `sysinfo` dependency)
- Modify: `src-tauri/src/runtime_manager.rs` (add detection functions + tests)

- [ ] **Step 1: Add the `sysinfo` dependency**

Edit `src-tauri/Cargo.toml`, add this line in the `[dependencies]` section (alphabetically near `subtle`/`tauri-plugin-*`, matching the file's existing loose grouping — exact position doesn't matter, just keep it in `[dependencies]`):

```toml
sysinfo = "0.37"
```

- [ ] **Step 2: Write the failing tests**

Add to the existing `#[cfg(test)] mod tests { use super::*; ... }` block at the bottom of `src-tauri/src/runtime_manager.rs` (after the existing `runtime_manager_pid_tracking` test):

```rust
  #[test]
  fn detect_ram_gb_returns_plausible_value() {
    // Any real machine running this test has at least 1GB and less than
    // 4TB of RAM. This is a sanity bound, not a mock — sysinfo reads the
    // real host, so the test environment's own RAM is the input.
    let ram = detect_ram_gb();
    assert!(ram >= 1, "expected at least 1GB RAM, got {}", ram);
    assert!(ram < 4096, "expected less than 4TB RAM, got {}", ram);
  }

  #[test]
  fn pick_disk_for_path_matches_longest_mount_point_prefix() {
    let disks = vec![
      ("/".to_string(), 50_000_000_000u64),
      ("/home".to_string(), 200_000_000_000u64),
    ];
    // A path under /home should match the /home entry, not the root entry,
    // because /home is the longer (more specific) matching prefix.
    let picked = pick_disk_for_path("/home/user/AppData", &disks);
    assert_eq!(picked, Some(200_000_000_000u64));
  }

  #[test]
  fn pick_disk_for_path_falls_back_to_root_when_no_specific_match() {
    let disks = vec![
      ("/".to_string(), 50_000_000_000u64),
      ("/home".to_string(), 200_000_000_000u64),
    ];
    let picked = pick_disk_for_path("/var/lib/alphonso", &disks);
    assert_eq!(picked, Some(50_000_000_000u64));
  }

  #[test]
  fn pick_disk_for_path_returns_none_for_empty_list() {
    let disks: Vec<(String, u64)> = vec![];
    assert_eq!(pick_disk_for_path("/anything", &disks), None);
  }
```

- [ ] **Step 3: Run tests to verify they fail**

Run from `src-tauri/`: `cargo test detect_ram_gb_returns_plausible_value pick_disk_for_path -- --nocapture`

Expected: compile error — `detect_ram_gb` and `pick_disk_for_path` are not defined yet.

- [ ] **Step 4: Implement the detection functions**

Add these functions to `src-tauri/src/runtime_manager.rs`, near the other `find_*`/`detect_*` style helpers (after `find_node()`, before the `// Tauri commands` section marker):

```rust
/// RAM detection via sysinfo, rounded down to whole GB.
fn detect_ram_gb() -> u64 {
  let mut sys = sysinfo::System::new_all();
  sys.refresh_memory();
  sys.total_memory() / 1024 / 1024 / 1024
}

/// Picks the free-space (bytes) of whichever disk's mount point is the
/// longest matching prefix of `path` — i.e. the most specific match. Pure
/// and independently testable: takes plain (mount_point, available_bytes)
/// pairs rather than sysinfo's own types, so no real disk I/O is needed to
/// test the matching logic itself.
fn pick_disk_for_path(path: &str, disks: &[(String, u64)]) -> Option<u64> {
  disks
    .iter()
    .filter(|(mount, _)| path.starts_with(mount.as_str()))
    .max_by_key(|(mount, _)| mount.len())
    .map(|(_, available)| *available)
}

/// Free disk space (GB) for the drive containing the app's own install
/// directory — the drive Setup's downloads will actually land on.
fn detect_disk_free_gb() -> u64 {
  let disks = sysinfo::Disks::new_with_refreshed_list();
  let disk_list: Vec<(String, u64)> = disks
    .list()
    .iter()
    .map(|d| (d.mount_point().to_string_lossy().to_string(), d.available_space()))
    .collect();

  let exe_dir = std::env::current_exe()
    .ok()
    .and_then(|p| p.parent().map(|p| p.to_string_lossy().to_string()))
    .unwrap_or_default();

  pick_disk_for_path(&exe_dir, &disk_list)
    .or_else(|| disk_list.iter().map(|(_, avail)| *avail).max())
    .map(|bytes| bytes / 1024 / 1024 / 1024)
    .unwrap_or(0)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test detect_ram_gb_returns_plausible_value pick_disk_for_path -- --nocapture`

Expected: all 4 tests PASS.

- [ ] **Step 6: Run the full existing test suite to check for regressions**

Run: `cargo test`

Expected: all pre-existing tests still pass (this task only adds new functions, touches nothing existing).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/runtime_manager.rs
git commit -m "feat(setup): add RAM and disk-space hardware detection"
```

---

## Task 2: Hardware detection — GPU (Rust)

**Files:**
- Modify: `src-tauri/src/runtime_manager.rs` (add GPU detection + tests)

**Scope note:** v1 targets Windows + Linux only (per the design doc's platform decision). Both platforms can query `nvidia-smi` the same way when an NVIDIA GPU + driver are present; a missing/failing `nvidia-smi` call is treated as "no GPU detected," not an error — AMD/Intel-only machines are common and must not crash or hang Setup.

- [ ] **Step 1: Write the failing tests**

Add to the same `mod tests` block:

```rust
  #[test]
  fn parse_nvidia_smi_output_extracts_vendor_and_model() {
    let output = "NVIDIA GeForce RTX 4060\n";
    let (vendor, model) = parse_nvidia_smi_output(output).expect("should parse");
    assert_eq!(vendor, "NVIDIA");
    assert_eq!(model, "GeForce RTX 4060");
  }

  #[test]
  fn parse_nvidia_smi_output_handles_trailing_whitespace_and_crlf() {
    let output = "NVIDIA GeForce RTX 3080\r\n\r\n";
    let (vendor, model) = parse_nvidia_smi_output(output).expect("should parse");
    assert_eq!(vendor, "NVIDIA");
    assert_eq!(model, "GeForce RTX 3080");
  }

  #[test]
  fn parse_nvidia_smi_output_returns_none_for_empty_output() {
    assert_eq!(parse_nvidia_smi_output(""), None);
    assert_eq!(parse_nvidia_smi_output("\n"), None);
  }

  #[test]
  fn parse_nvidia_smi_output_handles_non_nvidia_prefixed_name() {
    // Defensive: if nvidia-smi ever reports a name that doesn't start with
    // "NVIDIA" (unlikely, but the parser shouldn't crash on it), treat the
    // whole string as the model with an "Unknown" vendor rather than
    // panicking or silently dropping data.
    let (vendor, model) = parse_nvidia_smi_output("Some GPU Name\n").expect("should parse");
    assert_eq!(vendor, "Unknown");
    assert_eq!(model, "Some GPU Name");
  }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test parse_nvidia_smi_output -- --nocapture`

Expected: compile error — `parse_nvidia_smi_output` not defined.

- [ ] **Step 3: Implement GPU detection**

Add to `src-tauri/src/runtime_manager.rs`, directly below `detect_disk_free_gb()`:

```rust
/// Pure parser for `nvidia-smi --query-gpu=name --format=csv,noheader`
/// output — separated from the actual process spawn so it's testable
/// without needing a real GPU. Returns (vendor, model) for the first GPU
/// line, or None if the output is empty/unparseable.
fn parse_nvidia_smi_output(output: &str) -> Option<(String, String)> {
  let first_line = output.lines().find(|l| !l.trim().is_empty())?.trim();
  if first_line.is_empty() {
    return None;
  }
  if let Some(rest) = first_line.strip_prefix("NVIDIA ") {
    Some(("NVIDIA".to_string(), rest.to_string()))
  } else {
    Some(("Unknown".to_string(), first_line.to_string()))
  }
}

/// Detects an NVIDIA GPU via `nvidia-smi`. Returns (present, vendor, model).
/// A missing binary or failed command is "no GPU detected," never an error
/// — most machines don't have an NVIDIA GPU and Setup must not hang or
/// crash because of that.
fn detect_gpu() -> (bool, Option<String>, Option<String>) {
  let mut cmd = Command::new("nvidia-smi");
  cmd.args(["--query-gpu=name", "--format=csv,noheader"]);
  no_window(&mut cmd);
  match cmd.output() {
    Ok(out) if out.status.success() => {
      let stdout = String::from_utf8_lossy(&out.stdout);
      match parse_nvidia_smi_output(&stdout) {
        Some((vendor, model)) => (true, Some(vendor), Some(model)),
        None => (false, None, None),
      }
    }
    _ => (false, None, None),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test parse_nvidia_smi_output -- --nocapture`

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full suite for regressions**

Run: `cargo test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/runtime_manager.rs
git commit -m "feat(setup): add GPU detection via nvidia-smi"
```

---

## Task 3: `setup_scan_hardware` Tauri command

**Files:**
- Modify: `src-tauri/src/runtime_manager.rs` (add `HardwareProfile` struct + command)
- Modify: `src-tauri/src/lib.rs` (register the command)

- [ ] **Step 1: Write the failing test**

Add to `mod tests`:

```rust
  #[test]
  fn setup_scan_hardware_returns_populated_profile() {
    let profile = setup_scan_hardware();
    // Same real-machine sanity bounds as detect_ram_gb_returns_plausible_value —
    // this exercises the full command, not just the RAM function in isolation.
    assert!(profile.ram_gb >= 1);
    assert!(profile.disk_free_gb < 1_000_000); // sanity upper bound, not a real limit
  }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test setup_scan_hardware_returns_populated_profile -- --nocapture`

Expected: compile error — `setup_scan_hardware` and `HardwareProfile` not defined.

- [ ] **Step 3: Implement the struct and command**

Add to `src-tauri/src/runtime_manager.rs`, in the `// Tauri commands` section, near `runtime_check_prerequisites`:

```rust
// camelCase to match every other Tauri-command-returned struct in this
// file (PrereqStatus, etc.) and the frontend's HardwareProfile TypeScript
// interface (Task 5) — without this, Tauri would serialize ram_gb/
// disk_free_gb as snake_case and every frontend field access would be
// silently undefined instead of erroring, since TS doesn't check JSON
// shapes at runtime.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
  pub ram_gb: u64,
  pub disk_free_gb: u64,
  pub gpu_present: bool,
  pub gpu_vendor: Option<String>,
  pub gpu_model: Option<String>,
}

/// Aggregates RAM/disk/GPU detection into one result for Setup's System
/// Scan screen. Deliberately separate from `runtime_check_prerequisites`
/// (Python/Git/Ollama/Docker/Node) rather than merged into it — that
/// command already has its own established callers and shape; Setup's
/// frontend calls both in parallel instead.
#[tauri::command]
pub fn setup_scan_hardware() -> HardwareProfile {
  let (gpu_present, gpu_vendor, gpu_model) = detect_gpu();
  HardwareProfile {
    ram_gb: detect_ram_gb(),
    disk_free_gb: detect_disk_free_gb(),
    gpu_present,
    gpu_vendor,
    gpu_model,
  }
}
```

- [ ] **Step 4: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![` list (around line 728) and add this line next to the other `runtime_manager::` entries (near `runtime_manager::runtime_check_prerequisites,`):

```rust
      runtime_manager::setup_scan_hardware,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test setup_scan_hardware_returns_populated_profile -- --nocapture`

Expected: PASS.

- [ ] **Step 6: Run full suite + clippy**

Run: `cargo test && cargo clippy -- -D warnings`

Expected: all tests pass, zero clippy warnings (CI enforces `-D warnings` — do not skip this check).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/runtime_manager.rs src-tauri/src/lib.rs
git commit -m "feat(setup): expose setup_scan_hardware Tauri command"
```

---

## Task 4: Extend `TOOL_NAMES` to the full Runtime Hub catalogue

**Files:**
- Modify: `src/services/runtimeManagerService.ts:4-14`
- Modify: `src/test/runtimeManagerService.test.js:38-46`

**Why:** `TOOL_NAMES` currently lists only 7 of the 14 real tools in `runtime_manager.rs`'s `TOOLS` array — missing `openwebui`, `voice-os`, `n8n`, `mcp-server`, `alphonso-bridge`, `chromadb`, `openHands`. Setup's Recommended Setup and Install Queue screens need to reference `voice-os` and `chromadb` (and, via the Custom path, all the others) by name — calling `installTool('voice-os', ...)` against today's `ToolName` union would be a TypeScript compile error even though the Rust side already handles it correctly.

- [ ] **Step 1: Write the failing test**

In `src/test/runtimeManagerService.test.js`, replace the existing `TOOL_NAMES` describe block (lines 38-46):

```javascript
describe('TOOL_NAMES', () => {
  it('exports all 14 tool names, matching runtime_manager.rs\'s TOOLS catalogue', () => {
    expect(TOOL_NAMES).toHaveLength(14);
    expect(TOOL_NAMES).toContain('ollama');
    expect(TOOL_NAMES).toContain('comfyui');
    expect(TOOL_NAMES).toContain('automatic1111');
    expect(TOOL_NAMES).toContain('fooocus');
    expect(TOOL_NAMES).toContain('invokeai');
    expect(TOOL_NAMES).toContain('whisper');
    expect(TOOL_NAMES).toContain('audiocraft');
    expect(TOOL_NAMES).toContain('openwebui');
    expect(TOOL_NAMES).toContain('voice-os');
    expect(TOOL_NAMES).toContain('n8n');
    expect(TOOL_NAMES).toContain('mcp-server');
    expect(TOOL_NAMES).toContain('alphonso-bridge');
    expect(TOOL_NAMES).toContain('chromadb');
    expect(TOOL_NAMES).toContain('openHands');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/runtimeManagerService.test.js -t "TOOL_NAMES"`

Expected: FAIL — `expected length 7 to be 14`.

- [ ] **Step 3: Extend `TOOL_NAMES`**

In `src/services/runtimeManagerService.ts`, replace lines 4-12:

```typescript
export const TOOL_NAMES = [
  'ollama',
  'comfyui',
  'automatic1111',
  'fooocus',
  'invokeai',
  'whisper',
  'audiocraft',
  'openwebui',
  'voice-os',
  'n8n',
  'mcp-server',
  'alphonso-bridge',
  'chromadb',
  'openHands',
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/runtimeManagerService.test.js -t "TOOL_NAMES"`

Expected: PASS.

- [ ] **Step 5: Run the full test file for regressions**

Run: `npx vitest run src/test/runtimeManagerService.test.js`

Expected: all tests pass (the rest of the file mocks `invoke` directly and doesn't depend on the exact `TOOL_NAMES` contents).

- [ ] **Step 6: Commit**

```bash
git add src/services/runtimeManagerService.ts src/test/runtimeManagerService.test.js
git commit -m "fix(setup): extend TOOL_NAMES to the full 14-tool Runtime Hub catalogue"
```

---

## Task 5: `setupFlowService.ts` — hardware scan wrapper + disk-space precheck

**Files:**
- Create: `src/services/setupFlowService.ts`
- Test: `src/test/setupFlowService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/test/setupFlowService.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  scanHardware,
  checkDiskSpace,
  isSetupComplete,
  markSetupComplete,
} from '../services/setupFlowService';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('scanHardware', () => {
  it('invokes setup_scan_hardware and returns the result', async () => {
    const mockProfile = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };
    invoke.mockResolvedValue(mockProfile);
    const result = await scanHardware();
    expect(invoke).toHaveBeenCalledWith('setup_scan_hardware');
    expect(result).toEqual(mockProfile);
  });
});

describe('checkDiskSpace', () => {
  it('returns ok:true when free space covers selected components plus buffer', () => {
    const selected = [{ id: 'fooocus', sizeGb: 15 }, { id: 'starter-model', sizeGb: 2 }];
    const result = checkDiskSpace(selected, 30);
    expect(result.ok).toBe(true);
    expect(result.neededGb).toBe(17);
    expect(result.shortfallGb).toBe(0);
  });

  it('returns ok:false with the exact shortfall when free space is insufficient', () => {
    const selected = [{ id: 'fooocus', sizeGb: 15 }, { id: 'starter-model', sizeGb: 2 }];
    // 17GB needed + 10GB safety buffer = 27GB required; only 20GB free.
    const result = checkDiskSpace(selected, 20);
    expect(result.ok).toBe(false);
    expect(result.neededGb).toBe(17);
    expect(result.shortfallGb).toBe(7);
  });

  it('applies a 10GB safety buffer on top of the raw component total', () => {
    const selected = [{ id: 'starter-model', sizeGb: 2 }];
    // Raw need is 2GB; with a 10GB buffer, 11GB free should just barely fail.
    const justUnder = checkDiskSpace(selected, 11);
    expect(justUnder.ok).toBe(false);
    const justEnough = checkDiskSpace(selected, 12);
    expect(justEnough.ok).toBe(true);
  });

  it('treats an empty selection as needing only the safety buffer', () => {
    const result = checkDiskSpace([], 10);
    expect(result.ok).toBe(true);
    expect(result.neededGb).toBe(0);
  });
});

describe('isSetupComplete / markSetupComplete', () => {
  it('defaults to false when nothing is stored', () => {
    expect(isSetupComplete()).toBe(false);
  });

  it('returns true after markSetupComplete is called', () => {
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/setupFlowService.test.js`

Expected: FAIL — cannot find module `../services/setupFlowService`.

- [ ] **Step 3: Implement `setupFlowService.ts`**

Create `src/services/setupFlowService.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { getStorage, setStorage } from '../lib/appStorage';

const SETUP_COMPLETE_KEY = 'alphonso_setup_complete_v1';
// Flat GB buffer kept free beyond the sum of selected components, so a
// download never runs a drive down to exactly zero bytes free (which can
// itself cause unrelated OS/app failures well before disk is truly full).
const DISK_SAFETY_BUFFER_GB = 10;

export interface HardwareProfile {
  ramGb: number;
  diskFreeGb: number;
  gpuPresent: boolean;
  gpuVendor: string | null;
  gpuModel: string | null;
}

export async function scanHardware(): Promise<HardwareProfile> {
  return invoke('setup_scan_hardware');
}

export interface SelectableComponent {
  id: string;
  sizeGb: number;
}

export interface DiskSpaceCheck {
  ok: boolean;
  neededGb: number;
  shortfallGb: number;
}

/**
 * Sums the selected components' sizes plus a fixed safety buffer and
 * compares against free disk space. Pure function — no I/O — so the
 * Recommended Setup screen can call it synchronously on every selection
 * change without re-querying the filesystem each time.
 */
export function checkDiskSpace(selected: SelectableComponent[], freeGb: number): DiskSpaceCheck {
  const neededGb = selected.reduce((sum, c) => sum + c.sizeGb, 0);
  const requiredWithBuffer = neededGb + DISK_SAFETY_BUFFER_GB;
  const shortfallGb = Math.max(0, requiredWithBuffer - freeGb);
  return { ok: shortfallGb === 0, neededGb, shortfallGb };
}

export function isSetupComplete(): boolean {
  return getStorage(SETUP_COMPLETE_KEY, false);
}

export function markSetupComplete(): void {
  setStorage(SETUP_COMPLETE_KEY, true);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/setupFlowService.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no new errors introduced by this file.

- [ ] **Step 6: Commit**

```bash
git add src/services/setupFlowService.ts src/test/setupFlowService.test.js
git commit -m "feat(setup): add setupFlowService — hardware scan wrapper + disk precheck"
```

---

## Task 6: Setup gating in `App.tsx` (retiring `OnboardingWizard`)

**Files:**
- Modify: `src/hooks/useAppShellState.js:54`
- Modify: `src/App.tsx:83, 771-786`
- Test: `src/test/appLazyImports.test.js` (verify, do not need to change — confirms the new lazy import's export shape)

**Why this order:** wiring the gate before any Setup screens exist means `SetupFlow` can be built and tested screen-by-screen in the following tasks while already being reachable — matches this codebase's own established lazy-import + export-shape-guard pattern (`appLazyImports.test.js`), so nothing needs to be re-wired later.

- [ ] **Step 1: Write the failing test**

Create `src/test/App.setupGating.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../components/SetupFlow', () => ({
  SetupFlow: ({ onComplete }) => (
    <div data-testid="setup-flow">
      <button onClick={() => onComplete()}>finish setup</button>
    </div>
  ),
}));
vi.mock('../components/OnboardingWizard', () => ({
  OnboardingWizard: () => <div data-testid="onboarding-wizard">legacy onboarding</div>,
}));

import App from '../App';

beforeEach(() => {
  localStorage.clear();
});

describe('Setup gating', () => {
  it('renders SetupFlow, not OnboardingWizard, when setup is not yet complete', async () => {
    render(<App />);
    expect(await screen.findByTestId('setup-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
  });

  it('renders the main app shell when setup is already marked complete', async () => {
    localStorage.setItem('alphonso_setup_complete_v1', JSON.stringify(true));
    render(<App />);
    expect(screen.queryByTestId('setup-flow')).not.toBeInTheDocument();
    expect(await screen.findByTestId
      ? true
      : true).toBe(true); // placeholder assertion removed in Step 3 below — see note
  });
});
```

**Note on the second test:** the exact "main app shell rendered" assertion depends on what test id (if any) already exists on the shell root — `App.tsx:788` renders a `<div data-alphonso-shell-ready="true" ...>`. Replace the last two lines of the second test with:

```jsx
    expect(document.querySelector('[data-alphonso-shell-ready="true"]')).toBeInTheDocument();
```

(Written as a separate note rather than inline above because it's easy to paste the placeholder by mistake — use the corrected version.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/App.setupGating.test.jsx`

Expected: FAIL — `../components/SetupFlow` does not exist yet (the mock target module is missing, or the gating condition still checks `showOnboarding`/`OnboardingWizard` instead).

- [ ] **Step 3: Add the gating state**

In `src/hooks/useAppShellState.js`, replace line 54:

```javascript
  const [showOnboarding, setShowOnboarding] = useState(() => !getStorage('alphonso_onboarding_complete_v1', false));
```

with:

```javascript
  const [showSetup, setShowSetup] = useState(() => !getStorage('alphonso_setup_complete_v1', false));
```

Find where `showOnboarding`/`setShowOnboarding` are included in this hook's returned object (search for `showOnboarding` further down in the same file) and rename both to `showSetup`/`setShowSetup` there too.

- [ ] **Step 4: Wire the render branch in `App.tsx`**

In `src/App.tsx`, replace the lazy import at line 83:

```typescript
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard').then((mod) => ({ default: mod.OnboardingWizard })));
```

with:

```typescript
const SetupFlow = lazy(() => import('./components/SetupFlow').then((mod) => ({ default: mod.SetupFlow })));
```

Then replace the render block at lines 771-786:

```typescript
  if (showOnboarding && !settings.selectedModel && !isCoachWindow) {
    return (
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500 text-sm">Loading...</div>}>
        <OnboardingWizard
          onComplete={(chosenModel: string, chosenProvider?: string) => {
            setSettings((current: any) => ({
              ...current,
              ...(chosenModel ? { selectedModel: chosenModel } : {}),
              ...(chosenProvider ? { selectedProvider: chosenProvider } : {})
            }));
            setShowOnboarding(false);
          }}
        />
      </Suspense>
    );
  }
```

with:

```typescript
  if (showSetup && !isCoachWindow) {
    return (
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500 text-sm">Loading...</div>}>
        <SetupFlow
          onComplete={(chosenModel?: string, chosenProvider?: string) => {
            setSettings((current: any) => ({
              ...current,
              ...(chosenModel ? { selectedModel: chosenModel } : {}),
              ...(chosenProvider ? { selectedProvider: chosenProvider } : {})
            }));
            setShowSetup(false);
          }}
        />
      </Suspense>
    );
  }
```

Note the dropped `&& !settings.selectedModel` condition: `OnboardingWizard`'s gate was `showOnboarding && !settings.selectedModel` (so it could re-appear if a model was ever unset). Setup's own completion flag (`alphonso_setup_complete_v1`, written only once — see Task 10) is the sole source of truth for whether Setup has run, matching the design doc's §4.1 requirement that the flag is the single gate, not a secondary condition.

- [ ] **Step 5: Rename remaining `showOnboarding`/`setShowOnboarding` references**

Search the whole `src/` tree for any other reference:

Run: `grep -rn "showOnboarding\|setShowOnboarding" src/`

For each hit outside `useAppShellState.js`/`App.tsx` (there should be none beyond the destructuring in `App.tsx` around line 239, already covered by Step 4's edit touching the same variable names), rename to `showSetup`/`setShowSetup` to match.

- [ ] **Step 6: Create a minimal `SetupFlow` placeholder so the test can pass structurally**

This step exists only to unblock this task's own test in isolation — Task 7 replaces this with the real component. Create `src/components/SetupFlow.tsx`:

```tsx
import React from 'react';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

export function SetupFlow({ onComplete }: SetupFlowProps) {
  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      <button onClick={() => onComplete()}>Continue</button>
    </div>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/test/App.setupGating.test.jsx`

Expected: both tests PASS.

- [ ] **Step 8: Run the existing lazy-import guard test**

Run: `npx vitest run src/test/appLazyImports.test.js`

Expected: PASS — the new `SetupFlow` lazy import follows the same `.then((mod) => ({ default: mod.X }))` named-export pattern the test already checks for every lazy import in `App.tsx`.

- [ ] **Step 9: Run the full frontend test suite for regressions**

Run: `npx vitest run`

Expected: all tests pass. If any other test file directly imports/mocks `OnboardingWizard` or references `showOnboarding`, fix those references the same way as Step 5 (rename, don't delete the test's intent) rather than skipping them.

- [ ] **Step 10: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`

Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/hooks/useAppShellState.js src/App.tsx src/components/SetupFlow.tsx src/test/App.setupGating.test.jsx
git commit -m "feat(setup): wire Setup gating in place of OnboardingWizard"
```

**Do not delete `src/components/OnboardingWizard.tsx` yet** — Task 10 removes it once `SetupFlow` fully covers its role end-to-end; leaving it in place but unreferenced for now avoids a broken intermediate state if this plan is executed with review checkpoints between tasks.

---

## Task 7: `SetupFlow` container + Intent Selection screen

**Files:**
- Modify: `src/components/SetupFlow.tsx` (replace the Task 6 placeholder)
- Create: `src/components/setup/IntentSelection.tsx`
- Test: `src/test/setup/IntentSelection.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/setup/IntentSelection.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelection } from '../../components/setup/IntentSelection';

describe('IntentSelection', () => {
  it('renders all 5 intent tiles', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getByText('Chat Only')).toBeInTheDocument();
    expect(screen.getByText('Chat + Images')).toBeInTheDocument();
    expect(screen.getByText('Chat + Voice')).toBeInTheDocument();
    expect(screen.getByText('Full Power Mode')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onSelect with the tile id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Chat + Images'));
    expect(onSelect).toHaveBeenCalledWith('chat-images');
  });

  it('calls onSelect with "custom" when Custom is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(onSelect).toHaveBeenCalledWith('custom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/setup/IntentSelection.test.jsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `IntentSelection.tsx`**

Create `src/components/setup/IntentSelection.tsx`:

```tsx
import React from 'react';

export type IntentId = 'chat-only' | 'chat-images' | 'chat-voice' | 'full-power' | 'custom';

interface IntentTile {
  id: IntentId;
  label: string;
  blurb: string;
}

const INTENT_TILES: IntentTile[] = [
  { id: 'chat-only', label: 'Chat Only', blurb: 'Fastest setup, ~2GB' },
  { id: 'chat-images', label: 'Chat + Images', blurb: 'Adds Fooocus, ~15GB' },
  { id: 'chat-voice', label: 'Chat + Voice', blurb: 'Adds Voice OS, lightweight' },
  { id: 'full-power', label: 'Full Power Mode', blurb: 'Everything recommended for your hardware' },
  { id: 'custom', label: 'Custom', blurb: 'Pick components individually' },
];

export interface IntentSelectionProps {
  onSelect: (intent: IntentId) => void;
}

export function IntentSelection({ onSelect }: IntentSelectionProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text-1)]">What do you want Alphonso to do?</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">You can change this any time later.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {INTENT_TILES.map((tile) => (
          <button
            key={tile.id}
            onClick={() => onSelect(tile.id)}
            className="flex flex-col items-start gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-dim)]"
          >
            <span className="font-semibold text-[var(--text-1)]">{tile.label}</span>
            <span className="text-xs text-[var(--text-3)]">{tile.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/setup/IntentSelection.test.jsx`

Expected: all 3 tests PASS.

- [ ] **Step 5: Wire `IntentSelection` into `SetupFlow`**

Replace `src/components/SetupFlow.tsx` (the Task 6 placeholder) entirely:

```tsx
import React, { useState } from 'react';
import { IntentSelection, type IntentId } from './setup/IntentSelection';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'intent';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('intent');
  const [, setIntent] = useState<IntentId | null>(null);

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    // Later tasks (8-11) add the remaining steps (scan, recommend, queue,
    // activation) and advance `step` through them instead of completing
    // immediately here. Left as a direct call to onComplete for now so
    // this task's test suite exercises a real, working path end-to-end
    // rather than a dead-end screen.
    onComplete();
  };

  if (step === 'intent') {
    return (
      <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
        <IntentSelection onSelect={handleIntentSelect} />
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6: Update the Task 6 gating test's mock to match the real component's behavior**

`src/test/App.setupGating.test.jsx` currently mocks `../components/SetupFlow` entirely (from Task 6, Step 1), so this task's real implementation doesn't affect it — no change needed. Confirm by running it:

Run: `npx vitest run src/test/App.setupGating.test.jsx`

Expected: still PASS (the mock is untouched).

- [ ] **Step 7: Run full frontend suite for regressions**

Run: `npx vitest run`

Expected: all pass.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/SetupFlow.tsx src/components/setup/IntentSelection.tsx src/test/setup/IntentSelection.test.jsx
git commit -m "feat(setup): add SetupFlow container and Intent Selection screen"
```

---

## Task 8: System Scan screen

**Files:**
- Create: `src/components/setup/SystemScan.tsx`
- Test: `src/test/setup/SystemScan.test.jsx`
- Modify: `src/components/SetupFlow.tsx`

**Design note:** per the design doc §5 step 2, this screen runs *before* Intent Selection in the full flow. This task inserts it as the actual first step and moves Intent Selection to run after it.

- [ ] **Step 1: Write the failing test**

Create `src/test/setup/SystemScan.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/setupFlowService', () => ({
  scanHardware: vi.fn(),
}));
vi.mock('../../services/runtimeManagerService', () => ({
  checkPrerequisites: vi.fn(),
}));

import { scanHardware } from '../../services/setupFlowService';
import { checkPrerequisites } from '../../services/runtimeManagerService';
import { SystemScan } from '../../components/setup/SystemScan';

beforeEach(() => vi.clearAllMocks());

describe('SystemScan', () => {
  it('shows a scanning state, then results once both scans resolve', async () => {
    scanHardware.mockResolvedValue({ ramGb: 16, diskFreeGb: 220, gpuPresent: true, gpuVendor: 'NVIDIA', gpuModel: 'RTX 4060' });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });

    render(<SystemScan onContinue={() => {}} />);
    expect(screen.getByText(/scanning/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/16 ?GB RAM/i)).toBeInTheDocument());
    expect(screen.getByText(/220 ?GB free/i)).toBeInTheDocument();
    expect(screen.getByText(/RTX 4060/i)).toBeInTheDocument();
  });

  it('shows "no GPU detected" when gpuPresent is false', async () => {
    scanHardware.mockResolvedValue({ ramGb: 8, diskFreeGb: 50, gpuPresent: false, gpuVendor: null, gpuModel: null });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });

    render(<SystemScan onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('calls onContinue when the Continue button is clicked after scan completes', async () => {
    scanHardware.mockResolvedValue({ ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });
    const onContinue = vi.fn();

    render(<SystemScan onContinue={onContinue} />);
    const button = await waitFor(() => screen.getByText('Continue'));
    button.click();
    expect(onContinue).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/setup/SystemScan.test.jsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `SystemScan.tsx`**

Create `src/components/setup/SystemScan.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { scanHardware, type HardwareProfile } from '../../services/setupFlowService';
import { checkPrerequisites, type PrereqStatus } from '../../services/runtimeManagerService';

export interface SystemScanProps {
  onContinue: (profile: HardwareProfile, prereqs: PrereqStatus) => void;
}

export function SystemScan({ onContinue }: SystemScanProps) {
  const [scanning, setScanning] = useState(true);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([scanHardware(), checkPrerequisites()])
      .then(([hw, prereq]) => {
        if (cancelled) return;
        setProfile(hw);
        setPrereqs(prereq);
        setScanning(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Scan failure degrades to "continue with unknowns" rather than
        // blocking Setup entirely — see the design doc's §9 scan-timeout
        // open item. A full retry/timeout UX is deferred; this is the
        // minimum viable non-blocking fallback.
        setProfile({ ramGb: 0, diskFreeGb: 0, gpuPresent: false, gpuVendor: null, gpuModel: null });
        setPrereqs({ missing: [], installHint: 'Could not fully detect prerequisites.' });
        setScanning(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (scanning || !profile || !prereqs) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-2)]">Scanning your system…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">System Scan Results</h2>
      <div className="flex flex-col gap-2 w-full max-w-md text-sm">
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">RAM</span>
          <span className="text-[var(--text-1)]">{profile.ramGb}GB RAM</span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">Disk</span>
          <span className="text-[var(--text-1)]">{profile.diskFreeGb}GB free</span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">GPU</span>
          <span className="text-[var(--text-1)]">
            {profile.gpuPresent ? `${profile.gpuVendor} ${profile.gpuModel}` : 'No GPU detected'}
          </span>
        </div>
        {prereqs.dockerFound === false && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Docker not found — needed only if you choose n8n, ChromaDB, or OpenHands later. Not auto-installable; see Runtime Hub for manual setup instructions.
          </div>
        )}
      </div>
      <button
        onClick={() => onContinue(profile, prereqs)}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)]"
      >
        Continue
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/setup/SystemScan.test.jsx`

Expected: all 3 tests PASS.

- [ ] **Step 5: Wire `SystemScan` as the first step in `SetupFlow`**

Replace `src/components/SetupFlow.tsx`:

```tsx
import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import type { HardwareProfile } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [, setIntent] = useState<IntentId | null>(null);

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    // Task 9 (Recommended Setup) and beyond replace this direct completion
    // with the rest of the flow. Kept as a real, working end-to-end path
    // for now rather than a dead end.
    onComplete();
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
    </div>
  );
}
```

- [ ] **Step 6: Run full frontend suite for regressions**

Run: `npx vitest run`

Expected: all pass, including the Task 6/7 gating and IntentSelection tests (their component-level mocks/tests are unaffected by SetupFlow's internal step ordering).

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/SetupFlow.tsx src/components/setup/SystemScan.tsx src/test/setup/SystemScan.test.jsx
git commit -m "feat(setup): add System Scan screen, sequence before Intent Selection"
```

---

## Task 9: Recommended Setup screen (disk precheck + existing-install detection)

**Files:**
- Create: `src/components/setup/RecommendedSetup.tsx`
- Test: `src/test/setup/RecommendedSetup.test.jsx`
- Modify: `src/components/SetupFlow.tsx`

**Component manifest for this task:** a small static map from intent → recommended components, using the verified sizes from the design doc §6. Fooocus is the only optional image-gen default per the design doc; voice-os is lightweight enough not to need a size warning.

- [ ] **Step 1: Write the failing test**

Create `src/test/setup/RecommendedSetup.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
}));

import { getAllStatus } from '../../services/runtimeManagerService';
import { RecommendedSetup } from '../../components/setup/RecommendedSetup';

const hardware = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };

beforeEach(() => vi.clearAllMocks());

describe('RecommendedSetup', () => {
  it('recommends the starter model plus Fooocus for the chat-images intent', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/starter model/i)).toBeInTheDocument());
    expect(screen.getByText(/Fooocus/i)).toBeInTheDocument();
  });

  it('shows a no-GPU warning next to the image-gen recommendation when hardware.gpuPresent is false', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('marks a component as already installed when getAllStatus reports it installed', async () => {
    getAllStatus.mockResolvedValue([{ name: 'fooocus', installed: true, running: false }]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/already installed/i)).toBeInTheDocument());
  });

  it('blocks proceeding and shows a shortfall message when free disk space is insufficient', async () => {
    getAllStatus.mockResolvedValue([]);
    const tightHardware = { ...hardware, diskFreeGb: 5 };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={tightHardware} onProceed={onProceed} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/need \d+ ?GB more/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('calls onProceed with the selected component list when there is enough space', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} onProceed={onProceed} onCustomize={() => {}} />);
    const button = await waitFor(() => screen.getByText('Looks Good → Install'));
    fireEvent.click(button);
    expect(onProceed).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'starter-model' })]));
  });

  it('calls onCustomize when Customize is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const onCustomize = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} onProceed={() => {}} onCustomize={onCustomize} />);
    fireEvent.click(await waitFor(() => screen.getByText('Customize')));
    expect(onCustomize).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/setup/RecommendedSetup.test.jsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `RecommendedSetup.tsx`**

Create `src/components/setup/RecommendedSetup.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { getAllStatus } from '../../services/runtimeManagerService';
import { checkDiskSpace, type SelectableComponent } from '../../services/setupFlowService';
import type { HardwareProfile } from '../../services/setupFlowService';
import type { IntentId } from './IntentSelection';

interface RecommendedComponent extends SelectableComponent {
  label: string;
  warning?: string;
}

// Sizes per the design doc's §6 verified component table. "starter-model"
// maps to whatever DEPENDENCY_BUNDLING_PLAN.md's O2 lands on (llama3.2:3b,
// 2GB, at the time of writing) — see that doc for the authoritative current
// choice if this drifts.
const INTENT_RECOMMENDATIONS: Record<IntentId, RecommendedComponent[]> = {
  'chat-only': [{ id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 }],
  'chat-images': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
  ],
  'chat-voice': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
  ],
  'full-power': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
    { id: 'chromadb', label: 'ChromaDB (memory)', sizeGb: 1 },
  ],
  custom: [],
};

export interface RecommendedSetupProps {
  intent: IntentId;
  hardware: HardwareProfile;
  onProceed: (selected: RecommendedComponent[]) => void;
  onCustomize: () => void;
}

export function RecommendedSetup({ intent, hardware, onProceed, onCustomize }: RecommendedSetupProps) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllStatus()
      .then((statuses) => {
        if (cancelled) return;
        const installed = new Set(statuses.filter((s) => s.installed).map((s) => s.name));
        setInstalledNames(installed);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-2)]">Loading recommendations…</p>
      </div>
    );
  }

  const recommended = INTENT_RECOMMENDATIONS[intent];
  const toInstall = recommended.filter((c) => !installedNames.has(c.id));
  const diskCheck = checkDiskSpace(toInstall, hardware.diskFreeGb);
  const needsImageGen = recommended.some((c) => c.id === 'fooocus');

  return (
    <div className="flex flex-col items-center gap-4 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Recommended Setup</h2>
      <div className="flex flex-col gap-2 w-full text-sm">
        {recommended.map((c) => {
          const alreadyInstalled = installedNames.has(c.id);
          return (
            <div key={c.id} className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
              <span className="text-[var(--text-1)]">{c.label}</span>
              <span className="text-[var(--text-3)]">
                {alreadyInstalled ? 'already installed' : `${c.sizeGb}GB`}
              </span>
            </div>
          );
        })}
        {needsImageGen && !hardware.gpuPresent && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            No GPU detected — image generation will be slow (CPU-only).
          </div>
        )}
        {!diskCheck.ok && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Need {diskCheck.shortfallGb}GB more free disk space to install everything above.
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          disabled={!diskCheck.ok}
          onClick={() => diskCheck.ok && onProceed(toInstall)}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Looks Good → Install
        </button>
        <button
          onClick={onCustomize}
          className="rounded border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-2)]"
        >
          Customize
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/setup/RecommendedSetup.test.jsx`

Expected: all 6 tests PASS.

- [ ] **Step 5: Wire into `SetupFlow`**

Replace `src/components/SetupFlow.tsx`:

```tsx
import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import { RecommendedSetup } from './setup/RecommendedSetup';
import type { HardwareProfile, SelectableComponent } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent' | 'recommend';

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    if (selected === 'custom') {
      // Task 10's agent-grid Custom path replaces this direct completion.
      onComplete();
      return;
    }
    setStep('recommend');
  };

  const handleProceed = (_selected: SelectableComponent[]) => {
    // Task 10 (Install Queue) replaces this direct completion with the
    // real install flow.
    onComplete();
  };

  const handleCustomize = () => {
    // Task 10's agent-grid Custom path replaces this direct completion.
    onComplete();
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && intent && intent !== 'custom' && (
        <RecommendedSetup intent={intent} hardware={hardware} onProceed={handleProceed} onCustomize={handleCustomize} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run full frontend suite for regressions**

Run: `npx vitest run`

Expected: all pass.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/SetupFlow.tsx src/components/setup/RecommendedSetup.tsx src/test/setup/RecommendedSetup.test.jsx
git commit -m "feat(setup): add Recommended Setup screen with disk precheck and existing-install detection"
```

---

## Task 10: Install Queue, Early Exit, Activation, and Launch

**Files:**
- Create: `src/components/setup/InstallQueue.tsx`
- Create: `src/components/setup/ActivationSequence.tsx`
- Test: `src/test/setup/InstallQueue.test.jsx`
- Test: `src/test/setup/ActivationSequence.test.jsx`
- Modify: `src/components/SetupFlow.tsx`
- Delete: `src/components/OnboardingWizard.tsx` (and its test file, if superseded — see Step 9)

**Scope note:** this task implements Install Queue's real behavior (calling `installTool`/`installPrerequisite`, tracking per-task status) and a minimal, functional Activation Sequence (not full Framer Motion choreography — that's the deferred visual-polish pass per the design doc). The full error-recovery decision tree (§9 open item) is out of scope here; this task treats any install failure as a terminal `error` status shown inline, with no retry UI yet.

- [ ] **Step 1: Write the failing Install Queue test**

Create `src/test/setup/InstallQueue.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  installTool: vi.fn(),
}));

import { installTool } from '../../services/runtimeManagerService';
import { InstallQueue } from '../../components/setup/InstallQueue';

const components = [
  { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
  { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
];

beforeEach(() => vi.clearAllMocks());

describe('InstallQueue', () => {
  it('starts all components as pending and installs them via installTool', async () => {
    installTool.mockResolvedValue({ tool: 'x', ok: true, message: 'done' });
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} />);
    await waitFor(() => expect(installTool).toHaveBeenCalledTimes(2));
  });

  it('calls onStarterReady as soon as the starter-model component succeeds, without waiting for the rest', async () => {
    let resolveFooocus;
    installTool.mockImplementation((name) => {
      if (name === 'starter-model') return Promise.resolve({ tool: name, ok: true, message: 'done' });
      return new Promise((resolve) => { resolveFooocus = resolve; });
    });
    const onStarterReady = vi.fn();
    render(<InstallQueue components={components} onStarterReady={onStarterReady} onAllComplete={() => {}} />);
    await waitFor(() => expect(onStarterReady).toHaveBeenCalled());
    resolveFooocus({ tool: 'fooocus', ok: true, message: 'done' });
  });

  it('calls onAllComplete once every component finishes', async () => {
    installTool.mockResolvedValue({ tool: 'x', ok: true, message: 'done' });
    const onAllComplete = vi.fn();
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={onAllComplete} />);
    await waitFor(() => expect(onAllComplete).toHaveBeenCalled());
  });

  it('shows an error status for a component whose install rejects, without blocking the others', async () => {
    installTool.mockImplementation((name) => {
      if (name === 'fooocus') return Promise.reject(new Error('network error'));
      return Promise.resolve({ tool: name, ok: true, message: 'done' });
    });
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/setup/InstallQueue.test.jsx`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `InstallQueue.tsx`**

Create `src/components/setup/InstallQueue.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { installTool } from '../../services/runtimeManagerService';
import type { SelectableComponent } from '../../services/setupFlowService';

type TaskStatus = 'pending' | 'installing' | 'ready' | 'error';

interface Task extends SelectableComponent {
  label: string;
  status: TaskStatus;
  errorMessage?: string;
}

export interface InstallQueueProps {
  components: (SelectableComponent & { label: string })[];
  onStarterReady: () => void;
  onAllComplete: () => void;
}

export function InstallQueue({ components, onStarterReady, onAllComplete }: InstallQueueProps) {
  const [tasks, setTasks] = useState<Task[]>(
    components.map((c) => ({ ...c, status: 'pending' as TaskStatus }))
  );
  const starterReadyFired = useRef(false);
  const allCompleteFired = useRef(false);

  useEffect(() => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'installing' })));

    components.forEach((component) => {
      installTool(component.id)
        .then(() => {
          setTasks((prev) => prev.map((t) => (t.id === component.id ? { ...t, status: 'ready' } : t)));
        })
        .catch((err: unknown) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === component.id
                ? { ...t, status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
                : t
            )
          );
        });
    });
    // components is expected to be stable for the lifetime of this screen
    // (Setup doesn't let the user change the selection mid-install) — an
    // exhaustive dependency array would re-trigger every install on every
    // render, which is wrong here by design, not an oversight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const starter = tasks.find((t) => t.id === 'starter-model');
    if (starter?.status === 'ready' && !starterReadyFired.current) {
      starterReadyFired.current = true;
      onStarterReady();
    }
    const allDone = tasks.every((t) => t.status === 'ready' || t.status === 'error');
    if (allDone && !allCompleteFired.current) {
      allCompleteFired.current = true;
      onAllComplete();
    }
  }, [tasks, onStarterReady, onAllComplete]);

  return (
    <div className="flex flex-col gap-3 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Installing…</h2>
      {tasks.map((task) => (
        <div key={task.id} className="rounded bg-[var(--surface-2)] px-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-1)]">{task.label}</span>
            <span className="text-[var(--text-3)]">
              {task.status === 'pending' && 'Pending'}
              {task.status === 'installing' && 'Downloading…'}
              {task.status === 'ready' && 'Ready'}
              {task.status === 'error' && `Error: ${task.errorMessage}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/setup/InstallQueue.test.jsx`

Expected: all 4 tests PASS.

- [ ] **Step 5: Write the failing Activation Sequence test**

Create `src/test/setup/ActivationSequence.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ActivationSequence } from '../../components/setup/ActivationSequence';

describe('ActivationSequence', () => {
  it('shows "Alphonso is online." and calls onFinish after the full sequence', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="full" onFinish={onFinish} />);
    expect(screen.getByText(/alphonso is online/i)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onFinish).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('finishes faster for the toast variant than the full variant', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="toast" onFinish={onFinish} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onFinish).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/test/setup/ActivationSequence.test.jsx`

Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement `ActivationSequence.tsx`**

Create `src/components/setup/ActivationSequence.tsx`:

```tsx
import React, { useEffect } from 'react';

export interface ActivationSequenceProps {
  variant: 'full' | 'toast';
  onFinish: () => void;
}

// Real durations per the design doc §5 step 7. Full = 3-4s full-screen;
// toast = ~1.5s non-blocking. Framer Motion choreography (pulse/portal/
// emblem-ignite animation timing) is the deferred visual-polish pass —
// this is the functionally-correct, plainly-styled version.
const DURATIONS_MS: Record<'full' | 'toast', number> = {
  full: 3500,
  toast: 1500,
};

export function ActivationSequence({ variant, onFinish }: ActivationSequenceProps) {
  useEffect(() => {
    const timer = setTimeout(onFinish, DURATIONS_MS[variant]);
    return () => clearTimeout(timer);
  }, [variant, onFinish]);

  if (variant === 'toast') {
    return (
      <div className="fixed bottom-6 right-6 rounded-lg border border-[var(--emblem-green,#8EDB64)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)]">
        Alphonso is online.
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)]">
      <p className="text-2xl font-semibold text-[var(--emblem-green,#8EDB64)]">Alphonso is online.</p>
    </div>
  );
}
```

**Note:** `--emblem-green` is referenced with a literal fallback (`var(--emblem-green,#8EDB64)`) because this task doesn't add the token itself — see Step 10 below, which adds it to `src/styles/tokens.css` so the fallback becomes unnecessary. Both work identically until then.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/test/setup/ActivationSequence.test.jsx`

Expected: both tests PASS.

- [ ] **Step 9: Add the emblem color tokens**

In `src/styles/tokens.css`, add near the existing `/* Accent */` block:

```css
  /* Emblem — real brand green/orange, sampled from the shipped app icon.
     Scoped to the Activation Sequence's emblem-reveal moment only — the
     rest of the app's UI correctly uses --accent (cyan) above; see
     docs/superpowers/specs/2026-09-07-smart-installer-design.md §5 step 1
     for why these are deliberately different tokens, not a replacement. */
  --emblem-green: #8EDB64;
  --emblem-green-shadow: #1D5818;
  --emblem-orange: #F87C02;
```

- [ ] **Step 10: Wire Install Queue, Early Exit, and Activation into `SetupFlow`; write the completion flag on Launch**

Replace `src/components/SetupFlow.tsx`:

```tsx
import React, { useState } from 'react';
import { SystemScan } from './setup/SystemScan';
import { IntentSelection, type IntentId } from './setup/IntentSelection';
import { RecommendedSetup } from './setup/RecommendedSetup';
import { InstallQueue } from './setup/InstallQueue';
import { ActivationSequence } from './setup/ActivationSequence';
import { markSetupComplete } from '../services/setupFlowService';
import type { HardwareProfile, SelectableComponent } from '../services/setupFlowService';
import type { PrereqStatus } from '../services/runtimeManagerService';

export interface SetupFlowProps {
  onComplete: (chosenModel?: string, chosenProvider?: string) => void;
}

type SetupStep = 'scan' | 'intent' | 'recommend' | 'queue' | 'activation';
type LabeledComponent = SelectableComponent & { label: string };

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('scan');
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [, setPrereqs] = useState<PrereqStatus | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [queueComponents, setQueueComponents] = useState<LabeledComponent[]>([]);
  const [earlyExited, setEarlyExited] = useState(false);
  const [activationVariant, setActivationVariant] = useState<'full' | 'toast'>('full');

  const finishSetup = () => {
    markSetupComplete();
    onComplete();
  };

  const handleScanContinue = (hw: HardwareProfile, prereq: PrereqStatus) => {
    setHardware(hw);
    setPrereqs(prereq);
    setStep('intent');
  };

  const handleIntentSelect = (selected: IntentId) => {
    setIntent(selected);
    if (selected === 'custom') {
      // The agent-grid Custom path is out of scope for this plan (see the
      // design doc §5 step 3/4 — it's the power-user path, not the golden
      // path this plan covers). Falls through to completing Setup directly
      // for now rather than presenting a broken/half-built grid screen.
      finishSetup();
      return;
    }
    setStep('recommend');
  };

  const handleProceed = (selected: (SelectableComponent & { label?: string })[]) => {
    const labeled: LabeledComponent[] = selected.map((c) => ({ ...c, label: c.label ?? c.id }));
    setQueueComponents(labeled);
    setStep('queue');
  };

  const handleCustomize = () => {
    finishSetup();
  };

  const handleStarterReady = () => {
    setEarlyExited(true);
    setActivationVariant('toast');
    finishSetup();
  };

  const handleAllComplete = () => {
    if (!earlyExited) {
      setActivationVariant('full');
      setStep('activation');
    }
    // If earlyExited is true, the user already left via handleStarterReady;
    // a real toast-variant Activation for "last background task finished"
    // needs the main app shell to still be mounted to show a non-blocking
    // toast over it — that cross-component wiring is deferred, tracked as
    // a follow-up, not silently dropped (design doc §5 step 7's second
    // trigger context is genuinely not reachable from inside SetupFlow's
    // own lifecycle, since the component unmounts once finishSetup() runs).
  };

  return (
    <div data-testid="setup-flow-root" className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-1)]">
      {step === 'scan' && <SystemScan onContinue={handleScanContinue} />}
      {step === 'intent' && <IntentSelection onSelect={handleIntentSelect} />}
      {step === 'recommend' && hardware && intent && intent !== 'custom' && (
        <RecommendedSetup intent={intent} hardware={hardware} onProceed={handleProceed} onCustomize={handleCustomize} />
      )}
      {step === 'queue' && (
        <InstallQueue components={queueComponents} onStarterReady={handleStarterReady} onAllComplete={handleAllComplete} />
      )}
      {step === 'activation' && (
        <ActivationSequence variant={activationVariant} onFinish={finishSetup} />
      )}
    </div>
  );
}
```

**Known follow-up, stated explicitly rather than silently dropped:** the design doc's second Activation trigger context (a short toast playing over the *already-open main app* when the last background task finishes after an early exit) needs the toast to be shown from `App.tsx`'s own tree, not from inside `SetupFlow` — `SetupFlow` unmounts the moment `finishSetup()` runs on early exit. That wiring (likely a small global event/state the main app shell listens for) is a distinct follow-up task, not part of this plan; `handleAllComplete`'s comment above documents exactly where it needs to hook in.

- [ ] **Step 11: Delete `OnboardingWizard.tsx` and its test, now that `SetupFlow` covers its role end-to-end**

Run:

```bash
grep -rln "OnboardingWizard" src/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js"
```

Expected output: only `src/components/OnboardingWizard.tsx` itself and its own test file (e.g. `src/test/onboardingWizard.test.jsx` or similar — confirm the exact filename from the grep output). If anything else references it, stop and investigate before deleting — do not delete a file something else still depends on.

Once confirmed unreferenced elsewhere:

```bash
git rm src/components/OnboardingWizard.tsx
git rm <the matching test file found above>
```

- [ ] **Step 12: Run the full frontend suite for regressions**

Run: `npx vitest run`

Expected: all pass. If `appLazyImports.test.js` or any other test references the deleted `OnboardingWizard`, that's a real remaining reference Step 11's grep should have already caught — go back and fix it there rather than patching around it here.

- [ ] **Step 13: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src`

Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add src/components/SetupFlow.tsx src/components/setup/InstallQueue.tsx src/components/setup/ActivationSequence.tsx src/styles/tokens.css src/test/setup/InstallQueue.test.jsx src/test/setup/ActivationSequence.test.jsx
git rm src/components/OnboardingWizard.tsx <matching test file>
git commit -m "feat(setup): add Install Queue, Activation Sequence, wire Launch; retire OnboardingWizard"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full Rust suite**

From `src-tauri/`: `cargo test && cargo clippy -- -D warnings && cargo fmt --all -- --check`

Expected: all pass, zero clippy warnings, formatting clean.

- [ ] **Step 2: Run the full frontend suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`

Expected: all pass.

- [ ] **Step 3: Run the repo's standing verification baseline**

Run: `scripts/verify.ps1` (Windows) — per `REPO_RULES.md` R17/R22, this is required regardless of how narrow this change's surface is.

Expected: passes, or any failure is investigated and is not caused by this plan's changes (confirm via `git stash` + re-run if a failure's cause is ambiguous — and if you do, remember `git stash` only proves uncommitted changes aren't the cause, not already-committed ones, per this repo's own documented lesson in `docs/governance/DEFERRED_WORK.md`'s 2026-09-05 entry).

- [ ] **Step 4: Manual smoke test**

Run `npm run tauri dev`, delete/rename any local `alphonso_setup_complete_v1` localStorage entry (or use a fresh browser profile / clear site data for the dev server), reload, and walk through System Scan → Intent Selection → Recommended Setup → Install Queue → Activation → Launch for at least the `chat-only` intent end-to-end. Confirm the main app shell renders after Launch and reloading the page does *not* re-show Setup (the flag persisted correctly).

- [ ] **Step 5: Commit any fixes found during manual smoke testing separately**, each with its own focused commit message describing the specific bug fixed — do not bundle unrelated fixes into one commit.

---

## Plan self-review notes

- **Spec coverage:** this plan implements design doc §3 (gating mechanism), §5 steps 2-8 (System Scan through Launch, minus the Custom/agent-grid power-user path, which is explicitly out of scope — see Task 10 Step 10's comment), §6 (component sizes, used directly in `RecommendedSetup`'s manifest), and §4 (OnboardingWizard retirement). Explicitly **not** covered, matching the design doc's own §9 open items: the agent-grid Custom path, full Framer Motion visual polish, `prefers-reduced-motion`/accessibility pass, the full error-recovery decision tree, telemetry, and the toast-variant-after-early-exit cross-component wiring (documented as a named follow-up in Task 10).
- **Placeholder scan:** no `TODO`/`TBD`/"add appropriate X" phrasing in any step's code. Every deferred item is named specifically (e.g. "Task 10's agent-grid Custom path replaces this direct completion") rather than left vague.
- **Type consistency check:** `SelectableComponent { id, sizeGb }` (Task 5) is used consistently through `RecommendedSetup` (Task 9) and `InstallQueue` (Task 10) without renaming fields. `HardwareProfile` field names (`ramGb`, `diskFreeGb`, `gpuPresent`, `gpuVendor`, `gpuModel`) match between the Rust struct and the TypeScript interface — caught during this self-review that the Rust struct as first drafted would have serialized as snake_case (`ram_gb`) by default, silently mismatching the camelCase TypeScript everywhere else in this plan; fixed directly in Task 3 by adding `#[serde(rename_all = "camelCase")]`, matching the convention every other Tauri-command struct in `runtime_manager.rs` (`PrereqStatus`, etc.) already uses — verified by checking those structs directly, not assumed.
