# Frontend Migration Report — TypeScript Incremental Migration

**Date:** 2026-05-31  
**Agent:** Claude (Sonnet 4.6)  
**Scope:** TypeScript setup, serviceScopes documentation, memoryService model migration

---

## What Was Done

### 1. Deleted duplicate Vite config (`vite.config.cjs`)

`vite.config.cjs` was a CJS-format subset of `vite.config.js` — it only contained a minimal test block with no unique configuration. `vite.config.js` already contains the same test block plus the full build config (React plugin, chunk splitting, coverage thresholds). The `.cjs` file was deleted; `vite.config.js` is the sole Vite config going forward.

No `package.json` scripts referenced `vite.config.cjs` — all scripts go through wrapper `.mjs` scripts in `scripts/`.

### 2. Created TypeScript config files

Two new files were created at the project root:

- **`tsconfig.json`** — main TypeScript config. Key flags:
  - `strict: false` — avoids breaking the existing JS codebase during incremental migration
  - `allowJs: true` — lets `.js` and `.jsx` files coexist with `.ts` and `.tsx` files
  - `checkJs: false` — JS files are not type-checked (only included for resolution)
  - `noEmit: true` — TypeScript is used for checking only; Vite handles transpilation
  - `moduleResolution: "bundler"` — correct setting for Vite 5

- **`tsconfig.node.json`** — composite config for the Vite config file itself, required by the `references` field in `tsconfig.json`.

### 3. Documented all keys in `src/services/serviceScopes.js`

All 24 exported constants (23 string keys + 1 `PROOF_AUTHORITY` object) now have a one-line JSDoc comment directly above each export. Comments describe:
- What data the key stores
- Which service owns/manages that localStorage scope

No keys were renamed. The file is still pure JS and can be imported by any component without pulling in heavy service implementations.

### 4. Migrated `memoryService` to TypeScript (model migration)

**Files changed:**
- `src/services/memoryService.ts` — new TypeScript version (canonical)
- `src/services/memoryService.js.bak` — original JS preserved as backup
- `src/services/memoryService.js` — original still present (Vite resolves `.ts` first when importing without extension)

**TypeScript additions:**
- `MemoryRecord` — full interface for a stored memory item
- `MemoryWriteOptions` — partial options accepted by `pushMemoryItem()`
- `MemoryFilters` — filters object passed to the Rust `list_memory_records` invoke
- `DurableMemoryProbe` and `DurableRow` — internal interfaces (not exported)
- All function signatures annotated with parameter and return types
- `invoke<T>()` calls typed with their expected return shapes
- `any` used only where the `content` field is genuinely polymorphic (by design in the data model)

**Importer compatibility:** All 6 importing files (`App.jsx`, components, other services) use bare `'./services/memoryService'` imports without extension. Vite 5 resolves `.ts` before `.js` when both exist, so no importer changes are needed.

**TypeScript not yet installed:** The project does not yet have `typescript` in `devDependencies`. Install it before running type checks:

```bash
npm install --save-dev typescript
npx tsc --noEmit
```

---

## How to Migrate the Next Service (Step-by-Step Pattern)

Follow these steps for each service you migrate:

1. **Read the `.js` file** and note all imports, exports, and any Tauri `invoke` calls.

2. **Back up the original:**
   ```bash
   cp src/services/fooService.js src/services/fooService.js.bak
   ```

3. **Create `src/services/fooService.ts`** with:
   - All original logic copied verbatim
   - Exported interfaces for public data shapes (put them at the top)
   - Parameter and return types on all exported functions
   - `any` for genuinely polymorphic fields — do not block migration over complex generics
   - `invoke<ReturnType>('command_name', args)` typed appropriately

4. **Leave `fooService.js` in place** — Vite resolves `.ts` before `.js` automatically for bare imports, so no importers need updating.

5. **Run type check:**
   ```bash
   npx tsc --noEmit
   ```
   Fix errors only in the `.ts` file. Do not touch `.js` importers at this stage.

6. **Verify the build still works:**
   ```bash
   npm run build
   ```

7. **Once stable, remove `fooService.js.bak`** (after the next PR merges).

---

## Recommended Migration Order

Migrate services in this order — simplest/most isolated first, most complex last:

| Priority | Service | Reason |
|----------|---------|--------|
| 1 | `trustModel.js` | Pure utility, no Tauri, imported by memoryService (already migrated) |
| 2 | `appStorage.js` (lib) | Two tiny functions, no dependencies |
| 3 | `chatUtils.js` (lib) | Pure utilities, no Tauri, no service dependencies |
| 4 | `notificationService.js` | Very small (395 bytes), isolated |
| 5 | `recoveryService.js` | Small (1.8 KB), isolated |
| 6 | `sourceConfidenceService.js` | Small (1 KB), utility-only |
| 7 | `miyaMemoryService.js` | Small, isolated to Miya agent |
| 8 | `workflowMemoryService.js` | Small, imports memoryService (already typed) |
| 9 | `coachModeService.js` | Medium, isolated |
| 10 | `agentAvatarService.js` / `agentVisualService.js` | UI-adjacent, no Tauri |
| 11 | `chatPersistenceService.js` | Touches chat state, imported by App.jsx |
| 12 | `orchestrationReceiptService.js` / `orchestrationQueueService.js` | Moderate, use serviceScopes |
| 13 | `verificationService.js` | Uses Tauri invoke — needs type stubs |
| 14 | `connectorRegistryService.js` | Large (45 KB) — migrate last in registry group |
| 15 | `joseCommandRouterService.js` / `joseExecutionEngineService.js` | Largest files, heavy Tauri usage — migrate last |

---

## Known Blockers

### 1. TypeScript not installed
`typescript` is not in `devDependencies`. Install it before type-checking:
```bash
npm install --save-dev typescript
```

### 2. Tauri invoke type stubs
Services using `invoke()` from `@tauri-apps/api/core` call Rust commands whose return types are not declared anywhere in the frontend. Without stubs, these calls must use `invoke<any>()` or a best-effort interface.

**Solution:** Create `src/types/tauri-commands.d.ts` with ambient declarations:
```ts
// Example stub
declare module '@tauri-apps/api/core' {
  export function invoke(cmd: 'get_memory_store_status'): Promise<{ available: boolean }>;
  // Add one overload per Rust command as you migrate each service
}
```
This is optional — `invoke<any>()` is valid and does not block migration.

### 3. Vite `@vitejs/plugin-react` does not need `@vitejs/plugin-react-swc`
The project uses Babel-based `@vitejs/plugin-react`. TypeScript files will be transpiled by Vite/esbuild automatically — no additional plugin is needed.

### 4. `ollama.js` uses `isTauri()` — type import caution
`src/lib/ollama.js` imports `isTauri` from `@tauri-apps/api/core`. When migrating to `.ts`, ensure `@tauri-apps/api` types are available (they are — the package ships its own `.d.ts` files).

### 5. Large service files with 30+ local functions
Services like `joseCommandRouterService.js` (35 KB) and `workflowOperationsRegistryService.js` (17 KB) have many internal types. Use `any` liberally for internal function arguments to avoid a weeks-long typing effort. Only type the exported API surface.

---

## Running Type Checks

After installing TypeScript:

```bash
# Check the whole src/ directory
npx tsc --noEmit

# Check only the services directory
npx tsc --noEmit --project tsconfig.json

# Watch mode during migration
npx tsc --noEmit --watch
```

Expected initial output: zero errors (since `checkJs: false` and only `memoryService.ts` is typed so far). Errors will appear as more `.ts` files are added.

---

## Files Modified by This Agent

| File | Action |
|------|--------|
| `vite.config.cjs` | Deleted (duplicate) |
| `tsconfig.json` | Created |
| `tsconfig.node.json` | Created |
| `src/services/serviceScopes.js` | JSDoc added to all 24 exports |
| `src/services/memoryService.ts` | Created (TypeScript migration) |
| `src/services/memoryService.js.bak` | Created (backup of original) |
| `docs/FRONTEND_MIGRATION_REPORT.md` | Created (this file) |
