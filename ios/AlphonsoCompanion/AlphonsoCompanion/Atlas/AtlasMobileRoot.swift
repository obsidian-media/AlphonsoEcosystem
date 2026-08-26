import SwiftUI

/// The initial full-mobile product shell. It renders through typed domain models
/// backed by a fixture repository until the Cloud control-plane client is available.
struct AtlasMobileRoot: View {
    let openLegacyCompanion: () -> Void
    @StateObject private var store = AtlasWorkspaceStore()
    @State private var selection: AtlasDestination = .home
    @State private var showingCreateWork = false

    var body: some View {
        TabView(selection: $selection) {
            AtlasHomeView(createWork: { showingCreateWork = true })
                .tabItem { Label("Home", systemImage: "house") }
                .tag(AtlasDestination.home)

            AtlasWorkView(createWork: { showingCreateWork = true })
                .tabItem { Label("Work", systemImage: "checklist") }
                .tag(AtlasDestination.work)

            AtlasInboxView()
                .tabItem { Label("Inbox", systemImage: "tray") }
                .badge(store.briefing?.decisions.filter(\.state.canReview).count ?? 0)
                .tag(AtlasDestination.inbox)

            AtlasChatStudioView(createWork: { showingCreateWork = true })
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                .tag(AtlasDestination.chat)

            AtlasMoreView(openLegacyCompanion: openLegacyCompanion)
                .tabItem { Label("More", systemImage: "square.grid.2x2") }
                .tag(AtlasDestination.more)
        }
        .environmentObject(store)
        .tint(AtlasTheme.ColorToken.moss)
        .task {
            if store.briefing == nil {
                await store.load()
            }
        }
        .sheet(isPresented: $showingCreateWork) {
            AtlasCreateWorkSheet(posture: store.selectedPosture) { brief, desiredOutcome in
                Task { @MainActor in
                    await store.createDraft(brief: brief, desiredOutcome: desiredOutcome)
                    showingCreateWork = false
                    selection = .work
                }
            }
            .presentationDetents([.medium, .large])
        }
    }
}

enum AtlasDestination: Hashable {
    case home
    case work
    case inbox
    case chat
    case more
}

private struct AtlasHomeView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    let createWork: () -> Void
    @State private var selectedDecision: AtlasDecision?

    var body: some View {
        NavigationStack {
            AtlasPage {
                workspaceRibbon
                header
                nextDecision
                activeWork
                recentOutcomes
                commandDock
            }
            .navigationBarHidden(true)
            .sheet(item: $selectedDecision) { decision in
                AtlasDecisionReviewSheet(decision: decision) { reviewedDecision in
                    Task { @MainActor in await store.recordDecisionReview(reviewedDecision) }
                }
                .presentationDetents([.large])
            }
        }
    }

    private var workspaceRibbon: some View {
        Menu {
            ForEach(AtlasExecutionPosture.allCases) { value in
                Button {
                    store.selectPosture(value)
                } label: {
                    Label(value.detail, systemImage: value.symbol)
                }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ALPHONSO / FIELD NOTE")
                        .font(AtlasTheme.Type.proof)
                        .tracking(1)
                    Text(store.briefing?.workspace.name ?? "Loading workspace")
                        .font(AtlasTheme.Type.section)
                }
                Spacer()
                AtlasPostureBadge(store.selectedPosture, freshness: store.briefing?.freshness.label ?? "Loading")
            }
            .foregroundStyle(AtlasTheme.ColorToken.ink)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Changes workspace execution posture")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
            Text("Today")
                .font(AtlasTheme.Type.display)
                .foregroundStyle(AtlasTheme.ColorToken.ink)
            Text(headerDetail)
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .padding(.top, AtlasTheme.Spacing.xl)
    }

    private var headerDetail: String {
        guard let briefing = store.briefing else {
            return store.isLoading ? "Preparing your workspace briefing…" : "Workspace data is not available yet."
        }
        let decisionCount = briefing.decisions.filter(\.state.canReview).count
        let runCount = briefing.activeRuns.filter(\.phase.isActive).count
        return "\(decisionCount) decision\(decisionCount == 1 ? "" : "s") ready. \(runCount) workstream\(runCount == 1 ? "" : "s") moving with verified workspace context."
    }

    private var nextDecision: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
            AtlasSectionHeader("Next decision", detail: store.briefing?.nextDecision?.expiryLabel ?? "No pending review")
            if let decision = store.briefing?.nextDecision {
                Button { selectedDecision = decision } label: {
                    VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(decision.title)
                                    .font(AtlasTheme.Type.title)
                                Text(decision.summary)
                                    .font(AtlasTheme.Type.body)
                                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                            }
                            Spacer(minLength: AtlasTheme.Spacing.sm)
                            Image(systemName: "arrow.up.right")
                                .foregroundStyle(AtlasTheme.ColorToken.clay)
                        }
                        AtlasRule()
                        HStack {
                            AtlasStatusLabel(.awaitingDecision)
                            Spacer()
                            Text("POLICY / \(decision.policyCode)")
                                .font(AtlasTheme.Type.proof)
                                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                        }
                    }
                    .padding(AtlasTheme.Spacing.lg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.focalSheet, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: AtlasTheme.Radius.focalSheet, style: .continuous)
                            .stroke(AtlasTheme.ColorToken.clay.opacity(0.35), lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens evidence and policy details before approval")
            } else {
                AtlasEmptyState(symbol: "checkmark.seal", title: "No decision is waiting", detail: "New approvals and exceptions will appear here when the control plane sends them.")
            }
        }
    }

    private var activeWork: some View {
        VStack(alignment: .leading, spacing: 0) {
            AtlasSectionHeader("Active work", detail: "Verified workspace activity")
            if let briefing = store.briefing, !briefing.activeRuns.isEmpty {
                ForEach(briefing.activeRuns) { run in
                    AtlasLedgerRow(
                        title: run.title,
                        detail: run.summary,
                        stamp: run.timestampLabel,
                        status: run.status,
                        posture: run.posture,
                        action: {
                            if let decision = briefing.decisions.first(where: { $0.runID == run.id && $0.state.canReview }) {
                                selectedDecision = decision
                            }
                        }
                    )
                }
            } else {
                AtlasEmptyState(symbol: "bolt.slash", title: "No active work", detail: "New workspace activity will appear here as it begins.")
            }
        }
    }

    private var recentOutcomes: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            AtlasSectionHeader("Since you last checked")
            if let outcome = store.briefing?.outcomes.first {
                AtlasEmptyState(symbol: "checkmark.seal", title: outcome.title, detail: outcome.detail)
            } else {
                AtlasEmptyState(symbol: "clock", title: "No new outcomes", detail: "Verified outcomes will appear here after work is delivered.")
            }
        }
    }

    private var commandDock: some View {
        VStack(spacing: AtlasTheme.Spacing.sm) {
            AtlasPrimaryButton(title: "Create work", symbol: "plus", action: createWork)
            Text("Text, voice, or a file can begin a new brief.")
                .font(AtlasTheme.Type.metadata)
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
        }
        .padding(.top, AtlasTheme.Spacing.lg)
    }
}

private struct AtlasWorkView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    let createWork: () -> Void
    @State private var selectedSegment = 0

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    AtlasPostureBadge(store.selectedPosture, freshness: store.briefing?.freshness.label ?? "Loading")
                    Text("Work")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("A runbook for every outcome—plan, proof, decisions, and delivery in one record.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                Picker("Work view", selection: $selectedSegment) {
                    Text("Now").tag(0)
                    Text("Planned").tag(1)
                    Text("Library").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.top, AtlasTheme.Spacing.lg)
                .accessibilityHint("Filters the work runbook")

                runLedger

                AtlasPrimaryButton(title: "Create work", symbol: "plus", action: createWork)
                    .padding(.top, AtlasTheme.Spacing.lg)
            }
            .navigationBarHidden(true)
        }
    }

    private var visibleRuns: [AtlasRun] {
        let runs = store.briefing?.activeRuns ?? []
        switch selectedSegment {
        case 0:
            return runs.filter { $0.phase.isActive && $0.phase != .planned }
        case 1:
            return runs.filter { $0.phase == .planned || $0.phase == .queued }
        default:
            return runs.filter { !$0.phase.isActive }
        }
    }

    private var runLedger: some View {
        VStack(alignment: .leading, spacing: 0) {
            AtlasSectionHeader(sectionTitle, detail: "Open a record to inspect intent, evidence, and next action.")
            if visibleRuns.isEmpty {
                AtlasEmptyState(symbol: emptySymbol, title: emptyTitle, detail: emptyDetail)
                    .padding(.top, AtlasTheme.Spacing.sm)
            } else {
                ForEach(visibleRuns) { run in
                    AtlasLedgerRow(
                        title: run.title,
                        detail: run.summary,
                        stamp: run.traceID,
                        status: run.status,
                        posture: run.posture,
                        action: {}
                    )
                }
            }
        }
    }

    private var sectionTitle: String {
        switch selectedSegment {
        case 0: return "Runbook"
        case 1: return "Planned work"
        default: return "Delivered work"
        }
    }

    private var emptySymbol: String {
        selectedSegment == 2 ? "archivebox" : selectedSegment == 1 ? "calendar" : "bolt.slash"
    }

    private var emptyTitle: String {
        selectedSegment == 2 ? "No delivered work yet" : selectedSegment == 1 ? "No planned work yet" : "No active work"
    }

    private var emptyDetail: String {
        selectedSegment == 2 ? "Completed work and approved artifacts will be collected here." : selectedSegment == 1 ? "Create a brief or schedule a workflow to build the next run." : "New workspace activity will appear here as it begins."
    }
}

private struct AtlasInboxView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    @State private var selectedDecision: AtlasDecision?

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
                    Text("Inbox")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("A decision desk for approvals, exceptions, and assignments that require your judgement.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                AtlasSectionHeader("Needs your judgement", detail: decisionDetail)
                if actionableDecisions.isEmpty {
                    AtlasEmptyState(symbol: "checkmark.circle", title: "No decisions are waiting", detail: "Alphonso will surface exceptions, approvals, and assigned follow-ups here.")
                } else {
                    ForEach(actionableDecisions) { decision in
                        Button { selectedDecision = decision } label: {
                            HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
                                Image(systemName: decision.risk == .high ? "exclamationmark.shield" : "checkmark.shield")
                                    .font(.title3)
                                    .foregroundStyle(decision.risk == .high ? AtlasTheme.ColorToken.clay : AtlasTheme.ColorToken.amber)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(decision.title)
                                        .font(AtlasTheme.Type.title)
                                    Text("\(decision.affectedResource) · \(decision.expiryLabel)")
                                        .font(AtlasTheme.Type.body)
                                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                                    AtlasStatusLabel(.awaitingDecision)
                                }
                                Spacer(minLength: AtlasTheme.Spacing.xs)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                            }
                            .padding(.vertical, AtlasTheme.Spacing.md)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens evidence and policy details before approval")
                        AtlasRule()
                    }
                }

                AtlasSectionHeader("Cleared")
                AtlasEmptyState(
                    symbol: store.decisionReviewRecorded ? "checkmark.seal" : "clock",
                    title: store.decisionReviewRecorded ? "Review recorded" : "No completed decisions in this session",
                    detail: store.decisionReviewRecorded ? "The control-plane handoff is ready for the next confirmation step." : "Resolved decisions and auditable receipts will appear here."
                )
            }
            .navigationBarHidden(true)
            .sheet(item: $selectedDecision) { decision in
                AtlasDecisionReviewSheet(decision: decision) { reviewedDecision in
                    Task { @MainActor in await store.recordDecisionReview(reviewedDecision) }
                }
                .presentationDetents([.large])
            }
        }
    }

    private var actionableDecisions: [AtlasDecision] {
        (store.briefing?.decisions ?? []).filter(\.state.canReview)
    }

    private var decisionDetail: String {
        let count = actionableDecisions.count
        return "\(count) decision\(count == 1 ? "" : "s") · review before acting"
    }
}

private struct AtlasChatStudioView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    let createWork: () -> Void
    @State private var input = ""
    @State private var activeMode: StudioMode = .write

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: AtlasTheme.Spacing.lg) {
                        context
                        AtlasRule()
                        planBlock
                        evidenceBlock
                        outcomeBlock
                    }
                    .frame(maxWidth: 720, alignment: .leading)
                    .padding(.horizontal, AtlasTheme.Spacing.lg)
                    .padding(.vertical, AtlasTheme.Spacing.xl)
                }
                .background(AtlasTheme.ColorToken.mineral)
                composer
            }
            .navigationBarHidden(true)
        }
    }

    private var highlightedDecision: AtlasDecision? {
        store.briefing?.nextDecision
    }

    private var context: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
            HStack {
                Text("Chat")
                    .font(AtlasTheme.Type.display)
                Spacer()
                AtlasPostureBadge(store.selectedPosture, freshness: store.briefing?.freshness.label ?? "Loading")
            }
            Text(store.briefing?.workspace.name ?? "Preparing workspace context")
                .font(AtlasTheme.Type.section)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
            Text("A working studio. Direction, proof, and outcomes stay connected to the same typed run record.")
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .foregroundStyle(AtlasTheme.ColorToken.ink)
    }

    private var planBlock: some View {
        AtlasStudioBlock(
            kind: "PLAN",
            symbol: "list.bullet.clipboard",
            title: highlightedDecision?.title ?? "No active decision context",
            detail: highlightedDecision?.summary ?? "Start a new work brief to create a plan and connect it to an auditable run.",
            accent: AtlasTheme.ColorToken.cobalt
        )
    }

    private var evidenceBlock: some View {
        AtlasStudioBlock(
            kind: "EVIDENCE",
            symbol: "checkmark.shield",
            title: highlightedDecision == nil ? "No evidence has been selected" : "Evidence is available",
            detail: highlightedDecision?.evidenceSummary ?? "Evidence and source receipts will arrive through the correlated run event stream.",
            accent: AtlasTheme.ColorToken.moss
        )
    }

    private var outcomeBlock: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            AtlasStudioBlock(
                kind: "NEXT ACTION",
                symbol: highlightedDecision == nil ? "plus.circle" : "exclamationmark.shield",
                title: highlightedDecision == nil ? "Create a work brief" : "Review before approving",
                detail: highlightedDecision?.policyReason ?? "Use the command dock to state intent and create the next structured work run.",
                accent: highlightedDecision == nil ? AtlasTheme.ColorToken.moss : AtlasTheme.ColorToken.clay
            )
            Button("Convert this into a work brief", action: createWork)
                .font(AtlasTheme.Type.section)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
        }
    }

    private var composer: some View {
        VStack(spacing: AtlasTheme.Spacing.xs) {
            Picker("Composer mode", selection: $activeMode) {
                ForEach(StudioMode.allCases) { mode in
                    Image(systemName: mode.symbol).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Create work mode")

            HStack(alignment: .bottom, spacing: AtlasTheme.Spacing.sm) {
                TextField(activeMode.placeholder, text: $input, axis: .vertical)
                    .font(AtlasTheme.Type.body)
                    .lineLimit(1...4)
                    .padding(.horizontal, AtlasTheme.Spacing.sm)
                    .padding(.vertical, 10)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))

                Button {
                    createWork()
                    input = ""
                } label: {
                    Image(systemName: input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "arrow.up.circle" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AtlasTheme.ColorToken.quietInk : AtlasTheme.ColorToken.moss)
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Turn direction into a work brief")
            }
        }
        .padding(.horizontal, AtlasTheme.Spacing.md)
        .padding(.vertical, AtlasTheme.Spacing.sm)
        .background(AtlasTheme.ColorToken.mineral)
        .overlay(alignment: .top) { AtlasRule() }
    }
}

private struct AtlasMoreView: View {
    let openLegacyCompanion: () -> Void

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
                    Text("Atlas")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("The connected Alphonso ecosystem, arranged around responsibility and trust.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                AtlasSectionHeader("Workspace")
                AtlasMoreRow(symbol: "person.3", title: "Team", detail: "Roles, availability, and contribution traces")
                AtlasMoreRow(symbol: "bubble.left.and.bubble.right", title: "Boardroom", detail: "Collaborative decisions and session records")
                AtlasMoreRow(symbol: "books.vertical", title: "Knowledge", detail: "Workspace memory, evidence, and research")

                AtlasSectionHeader("Connections")
                AtlasMoreRow(symbol: "link", title: "Integrations", detail: "Scopes, health, and approved actions")
                AtlasMoreRow(symbol: "desktopcomputer", title: "Local Worker", detail: "Private resources and connected desktop capability")
                AtlasMoreRow(symbol: "lock.shield", title: "Security & Devices", detail: "Sessions, device trust, and audit records")

                AtlasSectionHeader("Migration")
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    Text("Legacy companion")
                        .font(AtlasTheme.Type.title)
                    Text("The existing local companion remains available while the full-mobile control plane is introduced.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    Button("Open legacy companion", action: openLegacyCompanion)
                        .font(AtlasTheme.Type.section)
                        .foregroundStyle(AtlasTheme.ColorToken.moss)
                }
                .padding(.vertical, AtlasTheme.Spacing.md)
            }
            .navigationBarHidden(true)
        }
    }
}

private struct AtlasMoreRow: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: AtlasTheme.Spacing.sm) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(detail)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
        }
        .padding(.vertical, AtlasTheme.Spacing.md)
        .accessibilityElement(children: .combine)
    }
}

private struct AtlasStudioBlock: View {
    let kind: String
    let symbol: String
    let title: String
    let detail: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            Label(kind, systemImage: symbol)
                .font(AtlasTheme.Type.proof)
                .tracking(0.8)
                .foregroundStyle(accent)
            Text(title)
                .font(AtlasTheme.Type.title)
                .foregroundStyle(AtlasTheme.ColorToken.ink)
            Text(detail)
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .padding(AtlasTheme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.sheet, style: .continuous))
        .overlay(alignment: .leading) {
            Rectangle().fill(accent).frame(width: 3)
        }
    }
}

private enum StudioMode: CaseIterable, Hashable, Identifiable {
    case write
    case speak
    case attach
    case suggest

    var id: Self { self }

    var symbol: String {
        switch self {
        case .write: return "square.and.pencil"
        case .speak: return "mic"
        case .attach: return "paperclip"
        case .suggest: return "sparkles"
        }
    }

    var placeholder: String {
        switch self {
        case .write: return "Direct Alphonso…"
        case .speak: return "Record a direction…"
        case .attach: return "Describe the file you want to add…"
        case .suggest: return "Ask for a suggested next step…"
        }
    }
}

private struct AtlasCreateWorkSheet: View {
    let posture: AtlasExecutionPosture
    let created: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var brief = ""
    @State private var outcome = ""

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    AtlasPostureBadge(posture, freshness: posture.detail)
                    Text("Create work")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("Start with intent. Alphonso will make the plan, execution location, and approval conditions explicit before work begins.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                AtlasSectionHeader("Brief")
                TextField("What needs to happen?", text: $brief, axis: .vertical)
                    .font(AtlasTheme.Type.body)
                    .lineLimit(3...8)
                    .padding(AtlasTheme.Spacing.md)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))

                AtlasSectionHeader("Desired outcome")
                TextField("What would a useful result look like?", text: $outcome, axis: .vertical)
                    .font(AtlasTheme.Type.body)
                    .lineLimit(2...6)
                    .padding(AtlasTheme.Spacing.md)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))

                AtlasPrimaryButton(title: "Prepare work", symbol: "arrow.right", action: {
                    created(
                        brief.trimmingCharacters(in: .whitespacesAndNewlines),
                        outcome.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                    dismiss()
                })
                .disabled(brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                .padding(.top, AtlasTheme.Spacing.lg)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: { dismiss() })
                }
            }
        }
    }
}

private struct AtlasDecisionReviewSheet: View {
    let decision: AtlasDecision
    let recordReview: (AtlasDecision) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var confirmed = false

    var body: some View {
        NavigationStack {
            AtlasPage(focus: true) {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                    AtlasSectionHeader("Decision review", detail: "A higher-impact action requires a deliberate review.", focus: true)
                    Text(decision.title)
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.focusInk)
                    AtlasStatusLabel(.awaitingDecision, focus: true)
                    AtlasRule(focus: true)

                    AtlasDecisionFact(label: "What will happen", value: decision.summary)
                    AtlasDecisionFact(label: "Affected resource", value: decision.affectedResource)
                    AtlasDecisionFact(label: "Execution location", value: decision.executionDetail)
                    AtlasDecisionFact(label: "Why review is required", value: decision.policyReason)
                    AtlasDecisionFact(label: "Expires", value: decision.expiryLabel)

                    AtlasSectionHeader("Evidence", detail: "Review the record before confirming.", focus: true)
                    Text(decision.evidenceSummary)
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.focusMutedInk)

                    Button {
                        confirmed = true
                        recordReview(decision)
                    } label: {
                        Label(confirmed ? "Review recorded" : confirmationTitle, systemImage: confirmed ? "checkmark.seal.fill" : confirmationSymbol)
                            .font(AtlasTheme.Type.section)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, AtlasTheme.Spacing.md)
                    }
                    .foregroundStyle(AtlasTheme.ColorToken.focusCanvas)
                    .background(confirmed ? AtlasTheme.ColorToken.focusMutedInk : AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
                    .padding(.top, AtlasTheme.Spacing.md)
                    .disabled(confirmed)
                    .accessibilityHint("Foundation interaction only. A future increment will request system biometric authentication and a server action challenge.")
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: { dismiss() })
                        .foregroundStyle(AtlasTheme.ColorToken.focusInk)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var confirmationTitle: String {
        decision.risk.isStepUpRequired ? "Confirm with Face ID" : "Record review"
    }

    private var confirmationSymbol: String {
        decision.risk.isStepUpRequired ? "faceid" : "checkmark.shield"
    }
}

private struct AtlasDecisionFact: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(AtlasTheme.Type.proof)
                .tracking(0.8)
                .foregroundStyle(AtlasTheme.ColorToken.focusMutedInk)
            Text(value)
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.focusInk)
        }
    }
}
