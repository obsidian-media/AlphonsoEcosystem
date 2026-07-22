# iOS Companion Operational Remote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the iOS Companion a premium, trustworthy operational remote for a paired Alphonso desktop while retaining explicit proof boundaries for unverified live capabilities.

**Architecture:** The desktop remains the source of truth and exposes a small, authenticated WebSocket RPC contract. The iOS app adds a typed operations snapshot layer over that contract, then presents it through a shared editorial visual system rather than per-screen card grids. Any action shown on mobile must map to an existing desktop RPC action; unavailable desktop data is represented as unavailable, never invented.

**Tech Stack:** SwiftUI, Combine, URLSession WebSocket, Rust/Tauri, serde_json, XCTest, Cargo tests, EAS/TestFlight release verification.

---

## File structure

- Create `ios/AlphonsoCompanion/AlphonsoCompanion/Models/OperationsSnapshot.swift`: typed, testable decoding for desktop status, active work, recent outcomes, and approval items.
- Create `ios/AlphonsoCompanion/AlphonsoCompanion/Views/OperationsView.swift`: authenticated home surface; it owns no transport code.
- Create `ios/AlphonsoCompanion/AlphonsoCompanion/Views/CompanionDesignSystem.swift`: palette, typography, separators, status treatment, and reusable row/button primitives.
- Create `ios/AlphonsoCompanion/AlphonsoCompanionTests/OperationsSnapshotTests.swift`: protocol decoding and action-state unit tests.
- Modify `src-tauri/src/companion_router.rs`: add a read-only `get_operations` response sourced from stored receipts and boardroom sessions; preserve the existing RPC methods.
- Modify `src-tauri/src/companion_server.rs` tests only as required to prove authenticated routing of the new RPC.
- Modify `ios/.../Services/WebSocketService.swift`: request, decode, publish, and refresh the typed snapshot; retain current pairing/streaming behavior.
- Modify `ios/.../ContentView.swift`, `PairingView.swift`, `ChatView.swift`, `VoiceView.swift`, `AgentDockView.swift`, `BoardroomView.swift`, and `SettingsView.swift`: apply the shared visual language and replace the initial tab with Operations after authentication.
- Modify `ios/.../Models/ConnectionState.swift` and its tests only for pure state/formatting helpers required by the new surfaces.
- Modify `ios/AlphonsoCompanion/README.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, and `docs/RELEASE_VERIFICATION.md`: document the exact contract and physical TestFlight acceptance matrix, labeling it PARTIAL until evidenced.

### Task 1: Define and prove the Operations data model

**Files:**
- Create: `ios/AlphonsoCompanion/AlphonsoCompanion/Models/OperationsSnapshot.swift`
- Test: `ios/AlphonsoCompanion/AlphonsoCompanionTests/OperationsSnapshotTests.swift`

- [ ] **Step 1: Write failing decoder tests for a full and an empty desktop response.**

```swift
func testDecodesApprovalAndRecentOutcome() throws {
    let snapshot = try OperationsSnapshot.decode(json: fixtureData)
    XCTAssertEqual(snapshot.approvals.first?.id, "approval-7")
    XCTAssertEqual(snapshot.recentOutcomes.first?.summary, "Release verified")
}

func testEmptyResponseIsAnHonestEmptySnapshot() throws {
    let snapshot = try OperationsSnapshot.decode(json: Data(#"{"operations":{}}"#.utf8))
    XCTAssertTrue(snapshot.approvals.isEmpty)
    XCTAssertTrue(snapshot.activeWork.isEmpty)
}
```

- [ ] **Step 2: Run the focused test and confirm the model does not yet exist.**

Run: `xcodebuild -project ios/AlphonsoCompanion/AlphonsoCompanion.xcodeproj -scheme AlphonsoCompanion -destination 'platform=iOS Simulator,name=iPhone 16' test -only-testing:AlphonsoCompanionTests/OperationsSnapshotTests`  
Expected: compilation failure naming `OperationsSnapshot` on macOS; on this Windows workspace record the command as a TestFlight/CI gate rather than claiming it ran.

- [ ] **Step 3: Implement the minimal typed decoding model.**

```swift
struct OperationsSnapshot: Equatable {
    let approvals: [ApprovalItem]
    let activeWork: [OperationsWorkItem]
    let recentOutcomes: [OperationsOutcome]

    static func decode(json: Data) throws -> OperationsSnapshot {
        let envelope = try JSONDecoder().decode(OperationsEnvelope.self, from: json)
        return envelope.operations.snapshot
    }
}
```

Use stable server IDs for `Identifiable` values, ISO-8601 decoding for timestamps, and empty arrays only when the desktop explicitly returns no records.

- [ ] **Step 4: Run the focused test and commit.**

Run: same command as Step 2. Expected: PASS in macOS CI/TestFlight validation.

```bash
git add ios/AlphonsoCompanion/AlphonsoCompanion/Models/OperationsSnapshot.swift ios/AlphonsoCompanion/AlphonsoCompanionTests/OperationsSnapshotTests.swift
git commit -m "feat(ios): add typed operations snapshot"
```

### Task 2: Expose a truthful desktop operations snapshot

**Files:**
- Modify: `src-tauri/src/companion_router.rs`
- Test: `src-tauri/src/companion_router.rs`

- [ ] **Step 1: Add a failing Rust test for the response shape produced from empty stores.**

```rust
#[test]
fn operations_snapshot_empty_state_uses_empty_arrays() {
  let value = operations_snapshot(vec![], vec![]);
  assert_eq!(value["approvals"], json!([]));
  assert_eq!(value["activeWork"], json!([]));
  assert_eq!(value["recentOutcomes"], json!([]));
}
```

- [ ] **Step 2: Add `get_operations` to `route`, factoring a pure `operations_snapshot(receipts, sessions)` helper.**

```rust
"get_operations" => handle_get_operations(app.clone()).await,
```

The helper must derive `activeWork` only from non-terminal orchestration receipts, derive `recentOutcomes` only from terminal receipts/sessions, and return an empty `approvals` array until the desktop has an authoritative pending-approval store. Do not manufacture approval records; keep `approve_task` available only for a real task ID supplied by the desktop.

- [ ] **Step 3: Run the focused Rust test and commit.**

Run: `cd src-tauri; cargo test companion_router::tests`  
Expected: PASS. If Windows dependency compilation exceeds the runner window, rely on the GitHub macOS/Ubuntu check and record the timeout as unverified local evidence.

```bash
git add src-tauri/src/companion_router.rs
git commit -m "feat(companion): expose truthful operations snapshot"
```

### Task 3: Connect the snapshot and actions safely on iOS

**Files:**
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/Services/WebSocketService.swift`
- Test: `ios/AlphonsoCompanion/AlphonsoCompanionTests/OperationsSnapshotTests.swift`

- [ ] **Step 1: Add a failing test for rejecting an operations payload that cannot decode.**

```swift
func testMalformedOperationsPayloadLeavesPreviousSnapshotIntact() {
    let previous = OperationsSnapshot.empty
    XCTAssertEqual(OperationsSnapshot.replacing(previous, with: Data("bad".utf8)), previous)
}
```

- [ ] **Step 2: Publish `operationsSnapshot`, request it only when authenticated, and route the result by JSON-RPC id.**

```swift
@Published private(set) var operationsSnapshot = OperationsSnapshot.empty

func refreshOperations() {
    guard connectionState == .authenticated else { return }
    sendJSONMessage(["id": "operations", "method": "get_operations", "params": [:]])
}
```

On successful authentication call `getStatus()`, `refreshOperations()`, and existing Boardroom refresh. Preserve the prior snapshot when decoding fails and show a non-sensitive “Could not refresh operations” message.

- [ ] **Step 3: Add `approveTask(id:)`, `abortCommand(commandId:)`, and `refreshOperations()` accessibility labels only where the desktop supports each action. Run tests and commit.**

```bash
git add ios/AlphonsoCompanion/AlphonsoCompanion/Services/WebSocketService.swift ios/AlphonsoCompanion/AlphonsoCompanionTests/OperationsSnapshotTests.swift
git commit -m "feat(ios): sync companion operations"
```

### Task 4: Build the premium shared visual language and Operations home

**Files:**
- Create: `ios/AlphonsoCompanion/AlphonsoCompanion/Views/CompanionDesignSystem.swift`
- Create: `ios/AlphonsoCompanion/AlphonsoCompanion/Views/OperationsView.swift`
- Modify: `ios/AlphonsoCompanion/AlphonsoCompanion/ContentView.swift`

- [ ] **Step 1: Define semantic visual tokens—never raw per-screen colors.**

```swift
enum CompanionTheme {
    static let canvas = Color(uiColor: .systemBackground)
    static let ink = Color(uiColor: .label)
    static let mutedInk = Color(uiColor: .secondaryLabel)
    static let accent = Color(red: 0.18, green: 0.19, blue: 0.47)
    static let rule = Color(uiColor: .separator)
    static let display = Font.system(size: 34, weight: .semibold, design: .rounded)
    static let section = Font.system(size: 13, weight: .semibold, design: .rounded)
}
```

Use full-width editorial sections, hairline rules, generous whitespace, and a single clear primary action. Do not introduce third-party fonts or circular portrait placeholders.

- [ ] **Step 2: Implement `OperationsView` as three flowing sections: Needs you, In motion, and Recent outcomes.**

```swift
if snapshot.approvals.isEmpty {
    EmptyOperationsState(title: "Nothing needs your approval", detail: "Approvals from the paired desktop appear here.")
} else {
    ForEach(snapshot.approvals) { approval in
        ApprovalRow(approval: approval) { service.approveTask(id: approval.id) }
    }
}
```

Show `Stop` only for an active command ID, `Approve` only for server-provided IDs, and a refresh control for status. Include offline/stale copy based on connection state and last refresh date.

- [ ] **Step 3: Make Operations tab 0 after authentication; keep Connect as the first-run/offline route.**

```swift
TabView(selection: $selectedTab) {
    OperationsView().tabItem { Label("Operations", systemImage: "bolt.horizontal") }.tag(0)
    PairingView().tabItem { Label("Connect", systemImage: "link") }.tag(1)
    // existing focused surfaces retain stable tags after this point
}
```

- [ ] **Step 4: Run a simulator build in macOS CI and commit.**

```bash
git add ios/AlphonsoCompanion/AlphonsoCompanion/Views/CompanionDesignSystem.swift ios/AlphonsoCompanion/AlphonsoCompanion/Views/OperationsView.swift ios/AlphonsoCompanion/AlphonsoCompanion/ContentView.swift
git commit -m "feat(ios): add premium operations home"
```

### Task 5: Apply the system to every focused surface

**Files:**
- Modify: `PairingView.swift`, `ChatView.swift`, `VoiceView.swift`, `AgentDockView.swift`, `BoardroomView.swift`, `SettingsView.swift`
- Test: existing `CompanionConnectionStateMachineTests.swift`, `VoiceSessionViewModelTests.swift`

- [ ] **Step 1: Replace material-card grids and local typography with `CompanionTheme` primitives.**

Pairing retains Bonjour → host/port → PIN → authenticated clarity and invalid-port blocking. Chat retains one send/stop lifecycle. Voice retains cloud enrollment gating. Agents retain the supplied named portrait crops, not full images or circles. Boardroom retains refresh and empty/error/stale states; it must not imply that an action happened without a server response. Settings makes reconnect state and paired endpoint legible.

- [ ] **Step 2: Add deterministic accessibility labels and Dynamic Type-safe layouts.**

```swift
Button("Refresh operations") { service.refreshOperations() }
    .accessibilityHint("Fetches the latest state from the paired desktop")
```

- [ ] **Step 3: Execute existing focused tests, review on iPhone SE and Pro Max simulators in CI, then commit.**

```bash
git add ios/AlphonsoCompanion/AlphonsoCompanion/Views ios/AlphonsoCompanion/AlphonsoCompanionTests
git commit -m "feat(ios): apply companion editorial design system"
```

### Task 6: Document proof, verify, review, and deliver

**Files:**
- Modify: `ios/AlphonsoCompanion/README.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, `docs/RELEASE_VERIFICATION.md`

- [ ] **Step 1: Record the RPC contract and exact physical TestFlight matrix:** Bonjour/manual pairing, invalid PIN/reconnect, streamed Chat/Stop, Boardroom refresh and real approval when server data exists, Agent handoff/status, Cloud Voice sign-in/enrollment/text/audio.

- [ ] **Step 2: Mark only source-tested parts COMPLETE.**

Use `PARTIAL — requires physical TestFlight evidence` for iOS networking, mDNS, microphone, Cloud Voice, and actual desktop pairing until evidence is captured. State that local Windows cannot run Xcode simulator validation.

- [ ] **Step 3: Run repository verification, push, request CodeRabbit review, and merge only through protected PR checks.**

Run: `npm run verify:app`  
Expected: lint, test, and production build pass.

Run: `git push origin agent/product-live-readiness`  
Expected: branch updates and PR checks begin.

Run: `gh pr comment 102 --body "@coderabbitai review"`  
Expected: review is requested; address concrete findings in new commits.

- [ ] **Step 4: Trigger the existing EAS profile only after CI and review are green; capture the TestFlight matrix.**

Run: `npx eas build --platform ios --profile production`  
Expected: EAS build URL; do not call the release COMPLETE solely because the build succeeds.

## Self-review

- Spec coverage: Tasks 1–3 implement truthful operations; Tasks 4–5 implement premium, non-template visual behavior across the complete Companion; Task 6 retains real-device proof and EAS delivery boundaries.
- No placeholders: approval items deliberately remain empty until the desktop owns authoritative approval data; this is explicit product behavior, not mock content.
- Type consistency: `OperationsSnapshot`, `ApprovalItem`, `OperationsWorkItem`, `OperationsOutcome`, `refreshOperations()`, and `approveTask(id:)` are defined before their use.
