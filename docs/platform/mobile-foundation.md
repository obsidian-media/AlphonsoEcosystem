# Alphonso Full-Mobile Foundation

## Purpose

The iOS application now has a new default product shell named **Atlas**. Atlas is the first implementation of Alphonso as a full mobile ecosystem client. It replaces the legacy companion-first navigation with **Home, Work, Inbox, Chat, and More** while the existing companion remains available as a reversible compatibility mode.

This is deliberately a migration seam, not a claim of backend parity. Atlas now renders through typed workspace, briefing, run, decision, and outcome models backed by an async fixture repository. The repository conforms to the same contract the future Cloud control-plane client will use, allowing the information architecture, accessibility patterns, state handling, and design system to be validated on device before live API connectivity is introduced.

## Source layout

| Path | Responsibility |
|---|---|
| `Foundation/AtlasDesignSystem.swift` | Semantic tokens, Dynamic Type roles, execution posture, status labels, and reusable Atlas components. |
| `Atlas/AtlasMobileRoot.swift` | Atlas navigation and store-driven Home/Work/Inbox/Chat/More screens, focused decision review, and create-work sheet. |
| `Atlas/AtlasDomain.swift` | Typed Workspace, Briefing, Run, Decision, and Outcome models; async repository protocol; fixture repository; observable workspace store. |
| `Atlas/AtlasCloudRepository.swift` | Versioned HTTPS v1 client, Keychain access-token provider, transport seam, response DTOs, typed error mapping, and fixture-aware repository factory. |
| `ContentView.swift` | Reversible `@AppStorage` migration switch between Atlas and the legacy local companion. |
| `AlphonsoCompanionUITests/AlphonsoCompanionUITests.swift` | Smoke coverage for the Atlas default experience and the legacy return path. |

## Migration contract

The legacy implementation remains structurally isolated and is selected with the `alphonso.mobile.experience` application preference. Atlas is the default. The **More → Open legacy companion** action intentionally preserves access to the old local pairing workflow until the new typed Hybrid worker protocol has been implemented and verified.

No new product work should be added directly to `WebSocketService` or the seven-tab legacy `TabView`. New mobile capability should target Atlas and extend `AtlasWorkspaceRepository` through versioned, typed control-plane contracts once available.

## Cloud control-plane configuration

Atlas remains fixture-backed by default. A build activates the Cloud repository only when `AtlasControlPlaneURL` is set to a valid HTTPS origin in `Info.plist` or build configuration. `AtlasControlPlaneAPIVersion` defaults to `v1`. Access tokens are read from a dedicated Keychain entry (`com.alphonso.mobile.controlPlane` / `access-token`); they are not reused from Voice Cloud and are never stored in `UserDefaults`.

| v1 operation | Request | Expected response |
|---|---|---|
| Workspace briefing | `GET /api/v1/workspaces/{workspace_id}/briefing` | Typed workspace, freshness, active runs, outcomes, decisions, and refresh timestamp. |
| Create draft work | `POST /api/v1/workspaces/{workspace_id}/runs/drafts` | Typed run, with snake-case `execution_posture` in the request. |
| Record decision review | `POST /api/v1/workspaces/{workspace_id}/decisions/{decision_id}/reviews` | Typed decision state. This is a review handoff, not a final approval endpoint. |

The client sends `Authorization: Bearer <access-token>`, `X-Alphonso-Client: ios`, and `X-Alphonso-API-Version: v1` on every request. It maps 401, 403, and 404 responses to specific session, permission, and record-availability states. Final approval still requires a server-issued action challenge and biometric step-up in a future increment.

## Planned replacement of fixture-backed state

| Atlas surface | Current foundation source | Target contract |
|---|---|---|
| Workspace ribbon | `AtlasWorkspaceStore` via a factory that falls back to `AtlasFixtureRepository` when Cloud is unconfigured | `WorkspaceSummary` plus health and execution-posture events. |
| Home | `AtlasBriefing` and correlated `AtlasRun`/`AtlasOutcome` records | `GET /v1/workspaces/{id}/briefing` and typed briefing events. |
| Work ledger | Typed `AtlasRun` phase records | `GET /v1/runs` and a correlated run event stream. |
| Inbox decision | Typed `AtlasDecision` state and review handoff | `GET /v1/decisions` plus server-issued action challenge/receipt. |
| Chat Studio | Typed workspace and decision context | Conversation/run API with structured event blocks and attachment transfer. |
| Local Worker | Legacy direct pairing remains available | QR/WSS device-bound worker registration and scoped Hybrid work dispatch. |

## Non-negotiable implementation rules

Atlas components use semantic design tokens and Dynamic Type rather than raw feature-level colours, fixed body font sizes, or decorative agent-card presentation. Every future run, decision, or message state must display execution posture, freshness, and a recovery path when those concepts apply.

A client-side UI state is never proof that a sensitive action happened. Approval, cancellation, Connector actions, and Hybrid worker dispatch must be confirmed by the control plane and recorded as an auditable receipt before Atlas presents a completed state.
