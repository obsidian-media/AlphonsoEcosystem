# iOS Companion — Operational Remote Design

## Purpose

Make the iOS Companion a premium operational remote for Alphonso Desktop. The first release must help a paired user see what needs attention, approve or stop live work, recover from connection problems, and continue deeper work on desktop. It is not a second desktop application.

The design must leave clean expansion paths for a later full-mobile Alphonso experience without duplicating the desktop orchestration engine on the phone.

## Product Boundary

### The Companion owns

- Discovery, secure pairing, reconnect, diagnostics, and desktop identity.
- A mobile operations view of approvals, active work, recent outcomes, and agent health.
- Lightweight actions sent to the desktop: approve, reject, stop, retry, refresh, and open on desktop.
- Focused Chat, Boardroom, Voice, Agents, and Settings detail experiences.
- Clear offline and stale-state treatment.

### The desktop owns

- Task creation, orchestration, policy enforcement, execution, audit logging, and durable workflow state.
- Final approval validation and every destructive or high-risk operation.
- The source of truth for live activity, Boardroom data, and agent status.

### Expansion rule

Mobile actions use stable command IDs, entity IDs, and timestamps. Later creation, planning, and configuration screens add new commands to the existing protocol; they do not introduce a separate mobile workflow engine.

## Information Architecture

### Operations is the post-pairing home

The existing Connect tab remains available for pairing and recovery. Once authenticated, the app opens Operations by default.

Operations presents three flowing sections:

1. **Needs you** — pending approvals, blocked work, and failures needing a decision.
2. **In motion** — active agent runs, streamed Chat requests, and current Boardroom activity. Each item can stop or open its desktop context.
3. **Recent outcomes** — completed, failed, and retriable work with an explicit next action.

Each item includes a source, last-sync timestamp, action state, and an **Open on desktop** handoff. The focused tabs remain destinations for detail, not parallel sources of workflow truth.

## Connection and Pairing

The transport remains:

`Bonjour discovery → resolved host/port → WebSocket → one-time PIN → authenticated session`

The Companion must visibly distinguish scanning, target selected, invalid manual endpoint, connecting, authenticated, reconnecting, disconnected, and invalid PIN. Manual input must reject invalid ports rather than silently changing them. Cached endpoints may simplify reconnect but never bypass the current one-time PIN/authentication rules.

When disconnected, the last received Operations state is marked stale. Approval, reject, stop, and retry actions are disabled until the desktop confirms authentication again. The UI never reports a remote action as complete before the matching desktop result/event arrives.

## Voice

Voice keeps Local and Cloud modes separate. Cloud Voice cannot capture or send a turn until the user signs in and enrolls the current iPhone. A result is only marked spoken after audio playback begins; failed playback remains a readable text response with retry. Physical-device pairing, enrollment, response text, and audible playback are a TestFlight release gate.

## Visual System

### Character

Premium editorial operating brief, not a template dashboard.

- **Canvas:** warm off-white in light appearance and near-black ink in dark appearance.
- **Structure:** full-bleed sections, generous negative space, hairline separators, and a single focal object per screen.
- **Surfaces:** no repeated floating-card grid. A surface exists only when it groups an actionable unit or frames an image.
- **Color:** deep indigo is the operating color. Green, amber, and red retain semantic meaning and are never decorative.
- **Agent imagery:** supplied agent portraits appear as tall, cropped editorial images. The source artwork is never presented as a miniature dashboard and generic circular placeholders are prohibited.

### Typography

Use an authored iOS type hierarchy based on high-quality system display and rounded faces rather than an unlicensed bundled font.

| Role | Treatment |
|---|---|
| Display | Rounded/display face, bold, tight tracking, used once per screen |
| Section label | Small caps/uppercase metadata with restrained tracking |
| Action title | Semibold rounded face, concise and scannable |
| Body | Standard system text face, 1.45–1.55 line height equivalent |
| Status/time | Small, high-contrast metadata; never the only indication of state |

All dynamic type sizes scale. Every interactive target is at least 44 × 44 points. Text and status colors meet WCAG contrast requirements in both appearances.

### Motion

Motion communicates state transitions only: connect, sync, action pending, action completed, and content handoff. Use short native-feeling opacity and transform transitions; avoid continuous decoration, glassmorphism, and layout-heavy animation.

## Components and States

### Connection strip

Shows desktop identity, connection status, last sync, and the single next recovery action. It has authenticated, scanning, connecting, reconnecting, disconnected, invalid-PIN, and stale states.

### Operation row

Shows one source, title, current state, timestamp, and one primary action. It has loading, actionable, pending-confirmation, completed, failed, stale, and unavailable states.

### Agent portrait treatment

Uses a rounded-rectangle crop of the supplied image, role metadata, and live semantic status. The portrait crop keeps the character visible; it does not render the source image's surrounding dashboard text as the primary visual.

### Desktop handoff

Every operational detail supports **Open on desktop**. If the deep link cannot be confirmed, the UI presents the exact desktop location and does not pretend that the app opened it.

## Data and Error Handling

The desktop emits authoritative event/result payloads. Mobile keeps a timestamped presentation snapshot only. Requests carry command IDs and an idempotency-safe action identity where the desktop protocol supports it.

Network, auth, malformed payload, and unavailable-feature failures are displayed in context with a recovery action. Errors do not erase the previous valid snapshot. Local-only UI actions are visually separate from actions that request desktop execution.

## Validation and Release Gates

### Automated

- Swift unit tests for manual endpoint validation, PIN normalization, connection-state transitions, voice enrollment gating, and action-state mapping.
- Rust tests for PIN authentication, lockout, mDNS hostname construction, and companion routing.
- CI lint, build, CodeQL, and CodeRabbit review on every PR update.

### Physical TestFlight matrix

One TestFlight build must prove:

1. Bonjour discovery and manual desktop address pairing on the same local network.
2. Invalid PIN recovery and reconnect after temporary network loss.
3. Chat send, streamed response, and stop action.
4. Boardroom refresh and one approval/reject action reflected by desktop.
5. Agent status update and desktop handoff.
6. Cloud Voice email sign-in, device enrollment, response text, and audible playback.

Until all six are recorded, pairing and Cloud Voice remain **PARTIAL** rather than release-proven.

## Delivery Sequence

1. Establish shared Companion visual primitives and connection-state treatment.
2. Build Operations from existing desktop protocol data; add only missing read/action contracts required for the defined operational boundary.
3. Apply the visual system to Chat, Boardroom, Voice, Agents, and Settings.
4. Add focused Swift/Rust tests and run CI review.
5. Produce one EAS/TestFlight build and execute the physical matrix.

