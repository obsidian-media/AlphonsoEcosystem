# Alphonso Full-Mobile Foundation

## Purpose

The iOS application now has a new default product shell named **Atlas**. Atlas is the first implementation of Alphonso as a full mobile ecosystem client. It replaces the legacy companion-first navigation with **Home, Work, Inbox, Chat, and More** while the existing companion remains available as a reversible compatibility mode.

This is deliberately a migration seam, not a claim of backend parity. The initial Atlas screens use fixture-backed content so that the new information architecture, accessibility patterns, and design system can be validated on device before the Cloud control-plane API is connected.

## Source layout

| Path | Responsibility |
|---|---|
| `Foundation/AtlasDesignSystem.swift` | Semantic tokens, Dynamic Type roles, execution posture, status labels, and reusable Atlas components. |
| `Atlas/AtlasMobileRoot.swift` | Atlas navigation, fixture-backed Home/Work/Inbox/Chat/More screens, focused decision review, and create-work sheet. |
| `ContentView.swift` | Reversible `@AppStorage` migration switch between Atlas and the legacy local companion. |
| `AlphonsoCompanionUITests/AlphonsoCompanionUITests.swift` | Smoke coverage for the Atlas default experience and the legacy return path. |

## Migration contract

The legacy implementation remains structurally isolated and is selected with the `alphonso.mobile.experience` application preference. Atlas is the default. The **More → Open legacy companion** action intentionally preserves access to the old local pairing workflow until the new typed Hybrid worker protocol has been implemented and verified.

No new product work should be added directly to `WebSocketService` or the seven-tab legacy `TabView`. New mobile capability should target Atlas and use versioned, typed control-plane contracts once available.

## Planned replacement of fixture-backed state

| Atlas surface | Current foundation source | Target contract |
|---|---|---|
| Workspace ribbon | Local fixture state | `WorkspaceSummary` plus health and execution-posture events. |
| Home | Local fixture state | `GET /v1/workspaces/{id}/briefing` and typed briefing events. |
| Work ledger | Local fixture state | `GET /v1/runs` and a correlated run event stream. |
| Inbox decision | Local fixture state | `GET /v1/decisions` plus server-issued action challenge/receipt. |
| Chat Studio | Local fixture state | Conversation/run API with structured event blocks and attachment transfer. |
| Local Worker | Legacy direct pairing remains available | QR/WSS device-bound worker registration and scoped Hybrid work dispatch. |

## Non-negotiable implementation rules

Atlas components use semantic design tokens and Dynamic Type rather than raw feature-level colours, fixed body font sizes, or decorative agent-card presentation. Every future run, decision, or message state must display execution posture, freshness, and a recovery path when those concepts apply.

A client-side UI state is never proof that a sensitive action happened. Approval, cancellation, Connector actions, and Hybrid worker dispatch must be confirmed by the control plane and recorded as an auditable receipt before Atlas presents a completed state.
