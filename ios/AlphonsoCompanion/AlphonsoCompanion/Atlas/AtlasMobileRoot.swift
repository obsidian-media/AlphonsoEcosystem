import SwiftUI

/// The initial full-mobile product shell. It renders through typed domain models
/// backed by a fixture repository until the Cloud control-plane client is available.
struct AtlasMobileRoot: View {
    let openLegacyCompanion: () -> Void
    @EnvironmentObject private var identity: AtlasIdentityService
    @StateObject private var store = AtlasWorkspaceStore()
    @State private var selection: AtlasDestination = .home
    @State private var workSegment = 0
    @State private var showingCreateWork = false
    @State private var draftSeed = ""
    @State private var showingAuditTrail = false
    @State private var showingAccount = false

    var body: some View {
        TabView(selection: $selection) {
            AtlasHomeView(createWork: {
                draftSeed = ""
                showingCreateWork = true
            })
                .tabItem { Label("Home", systemImage: "house") }
                .tag(AtlasDestination.home)

            AtlasWorkView(
                createWork: {
                    draftSeed = ""
                    showingCreateWork = true
                },
                selectedSegment: $workSegment
            )
                .tabItem { Label("Work", systemImage: "checklist") }
                .tag(AtlasDestination.work)

            AtlasInboxView()
                .tabItem { Label("Inbox", systemImage: "tray") }
                .badge(store.briefing?.decisions.filter(\.state.canReview).count ?? 0)
                .tag(AtlasDestination.inbox)

            AtlasChatStudioView(createWork: { direction in
                draftSeed = direction
                showingCreateWork = true
            })
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                .tag(AtlasDestination.chat)

            AtlasMoreView(
                openLegacyCompanion: openLegacyCompanion,
                openAuditTrail: { showingAuditTrail = true },
                openAccount: { showingAccount = true }
            )
                .tabItem { Label("More", systemImage: "square.grid.2x2") }
                .tag(AtlasDestination.more)
        }
        .environmentObject(store)
        .tint(AtlasTheme.ColorToken.moss)
        .task {
            if AtlasCloudConfiguration.fromBundle() != nil {
                try? await identity.restoreAndEnroll()
            }
            if store.briefing == nil {
                await store.load()
            }
            if case .enrolled = identity.state {
                store.startLiveUpdates()
            }
        }
        .onChange(of: identity.state) { newState in
            if case .enrolled = newState {
                store.startLiveUpdates()
            } else {
                store.stopLiveUpdates()
            }
        }
        .onDisappear {
            store.stopLiveUpdates()
        }
        .sheet(isPresented: $showingCreateWork) {
            AtlasCreateWorkSheet(
                posture: store.selectedPosture,
                initialBrief: draftSeed,
                created: { brief, desiredOutcome in
                    await store.createDraft(brief: brief, desiredOutcome: desiredOutcome)
                },
                viewPreparedWork: {
                    showingCreateWork = false
                    workSegment = 1
                    selection = .work
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showingAuditTrail) {
            AtlasAuditTrailView()
                .environmentObject(store)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showingAccount) {
            AtlasAccountCloudView()
                .environmentObject(identity)
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
    @State private var selectedRun: AtlasRun?

    var body: some View {
        NavigationStack {
            AtlasPage {
                workspaceRibbon
                workspaceHealth
                header
                nextDecision
                activeWork
                recentOutcomes
                commandDock
            }
            .navigationBarHidden(true)
            .sheet(item: $selectedDecision) { decision in
                AtlasDecisionReviewSheet(decision: decision)
                    .environmentObject(store)
                    .presentationDetents([.large])
            }
            .sheet(item: $selectedRun) { run in
                AtlasRunDetailSheet(run: run)
                    .environmentObject(store)
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

    private var workspaceHealth: some View {
        let status = store.syncStatus
        return HStack(alignment: .top, spacing: AtlasTheme.Spacing.sm) {
            Group {
                if status.isWorking {
                    ProgressView()
                        .tint(AtlasTheme.ColorToken.moss)
                } else {
                    Image(systemName: status.symbol)
                        .foregroundStyle(syncTint)
                }
            }
            .frame(width: 22, height: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(status.title)
                    .font(AtlasTheme.Type.section)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(status.detail)
                    .font(AtlasTheme.Type.metadata)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: AtlasTheme.Spacing.xs)

            if status.canRefresh {
                Button("Refresh") {
                    Task { @MainActor in await store.load() }
                }
                .font(AtlasTheme.Type.section)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
                .frame(minHeight: 44)
                .padding(.horizontal, AtlasTheme.Spacing.xs)
                .accessibilityHint("Requests a fresh authoritative workspace briefing")
            }
        }
        .padding(AtlasTheme.Spacing.md)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
        .padding(.top, AtlasTheme.Spacing.md)
        .accessibilityElement(children: .combine)
    }

    private var syncTint: Color {
        switch store.syncStatus {
        case .failed: return AtlasTheme.ColorToken.clay
        case .live: return AtlasTheme.ColorToken.moss
        case .snapshot: return AtlasTheme.ColorToken.cobalt
        case .refreshing: return AtlasTheme.ColorToken.moss
        case .idle: return AtlasTheme.ColorToken.quietInk
        }
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
                        action: { selectedRun = run }
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
    @Binding var selectedSegment: Int
    @State private var selectedRun: AtlasRun?

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
        .sheet(item: $selectedRun) { run in
            AtlasRunDetailSheet(run: run)
                .environmentObject(store)
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
                        action: { selectedRun = run }
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

private struct AtlasRunDetailSheet: View {
    let run: AtlasRun
    @EnvironmentObject private var store: AtlasWorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDecision: AtlasDecision?

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    AtlasPostureBadge(run.posture, freshness: run.timestampLabel)
                    Text("Work record")
                        .font(AtlasTheme.Type.proof)
                        .tracking(1.1)
                        .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                    Text(run.title)
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    AtlasStatusLabel(run.status)
                }

                AtlasRule()

                AtlasSectionHeader("Intent", detail: "The record preserves why this work exists and who owns the next accountable step.")
                AtlasRunFact(label: "Objective", value: run.summary)
                AtlasRunFact(label: "Owner", value: run.owner)
                AtlasRunFact(label: "State", value: run.phaseLabel)
                AtlasRunFact(label: "Last verified update", value: run.updatedAt.formatted(.relative(presentation: .named)))

                AtlasSectionHeader("Next accountable step")
                Text(run.nextAction)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(AtlasTheme.Spacing.md)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))

                decisionSection

                AtlasSectionHeader("Record trace", detail: "Use this immutable identifier when referring to the workspace record or its audit trail.")
                AtlasRunFact(label: "Trace", value: run.traceID, monospaced: true)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: { dismiss() })
                }
            }
        }
        .sheet(item: $selectedDecision) { decision in
            AtlasDecisionReviewSheet(decision: decision)
                .environmentObject(store)
        }
    }

    @ViewBuilder
    private var decisionSection: some View {
        if let decision = linkedDecision {
            AtlasSectionHeader("Decision checkpoint", detail: "This work remains connected to its evidence and policy record.")
            AtlasRunFact(label: "Policy", value: decision.policyCode)
            AtlasRunFact(label: "Evidence", value: decision.evidenceSummary)
            AtlasPrimaryButton(title: "Open decision review", symbol: "checkmark.shield", action: {
                selectedDecision = decision
            })
            .accessibilityHint("Opens the linked evidence and policy review. Recording a confirmation does not execute an external action.")
        } else {
            AtlasSectionHeader("Decision checkpoint")
            AtlasEmptyState(
                symbol: "checkmark.shield",
                title: "No decision is attached",
                detail: "This record has no policy checkpoint waiting for your review."
            )
        }
    }

    private var linkedDecision: AtlasDecision? {
        store.briefing?.decisions.first(where: { $0.runID == run.id })
    }
}

private struct AtlasRunFact: View {
    let label: String
    let value: String
    var monospaced = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(AtlasTheme.Type.proof)
                .tracking(0.8)
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            Text(value)
                .font(monospaced ? AtlasTheme.Type.metadata.monospaced() : AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
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
                AtlasDecisionReviewSheet(decision: decision)
                    .environmentObject(store)
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
    let createWork: (String) -> Void
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

    private var workBriefSeed: String {
        let composedDirection = input.trimmingCharacters(in: .whitespacesAndNewlines)
        return composedDirection.isEmpty ? (highlightedDecision?.summary ?? "") : composedDirection
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
            Button("Convert this into a work brief") {
                createWork(workBriefSeed)
            }
                .font(AtlasTheme.Type.section)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
                .frame(minHeight: 44, alignment: .leading)
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
                    createWork(input.trimmingCharacters(in: .whitespacesAndNewlines))
                    input = ""
                } label: {
                    Image(systemName: input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "arrow.up.circle" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AtlasTheme.ColorToken.quietInk : AtlasTheme.ColorToken.moss)
                        .frame(width: 44, height: 44)
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
    let openAuditTrail: () -> Void
    let openAccount: () -> Void

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
                Button(action: openAccount) {
                    AtlasMoreRow(symbol: "person.crop.circle", title: "Account & Cloud", detail: "Session status, device trust, and safe recovery")
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens Atlas account connection and device-trust status")
                AtlasMoreRow(symbol: "person.3", title: "Team", detail: "Roles, availability, and contribution traces")
                AtlasMoreRow(symbol: "bubble.left.and.bubble.right", title: "Boardroom", detail: "Collaborative decisions and session records")
                AtlasMoreRow(symbol: "books.vertical", title: "Knowledge", detail: "Workspace memory, evidence, and research")

                AtlasSectionHeader("Connections")
                AtlasMoreRow(symbol: "link", title: "Integrations", detail: "Scopes, health, and approved actions")
                AtlasMoreRow(symbol: "desktopcomputer", title: "Local Worker", detail: "Private resources and connected desktop capability")
                Button(action: openAuditTrail) {
                    AtlasMoreRow(symbol: "lock.shield", title: "Security & Devices", detail: "Sessions, device trust, and accountability records")
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the immutable review and confirmation record")

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

private struct AtlasAccountCloudView: View {
    @EnvironmentObject private var identity: AtlasIdentityService
    @Environment(\.dismiss) private var dismiss
    @State private var isReconnecting = false

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    Text("Account & Cloud")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("A clear view of this device’s Atlas connection. Credentials and device identifiers remain private to the secure system boundary.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                AtlasSectionHeader("Connection status")
                statusRecord

                AtlasSectionHeader("Trust boundary", detail: "Atlas keeps the current access token in a dedicated ThisDeviceOnly Keychain entry before requesting server enrollment.")
                AtlasRunFact(label: "Control plane", value: controlPlaneLabel)
                AtlasRunFact(label: "Device trust", value: deviceTrustLabel)
                AtlasRunFact(label: "Sensitive actions", value: "Policy review, server challenge, local biometric handoff, and a non-executing receipt remain separate steps.")

                recoveryControl

                AtlasSectionHeader("Recovery note")
                Text("This surface can reconnect the existing authenticated session and device enrollment. It does not replace the dedicated Atlas sign-in system still required for production rollout.")
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: { dismiss() })
                }
            }
        }
    }

    private var statusRecord: some View {
        let status = identity.state.accountStatus
        return HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
            Image(systemName: status.symbol)
                .font(.title2)
                .foregroundStyle(status.isConnected ? AtlasTheme.ColorToken.moss : status.canReconnect ? AtlasTheme.ColorToken.amber : AtlasTheme.ColorToken.quietInk)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xxs) {
                Text(status.title)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(status.detail)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(AtlasTheme.Spacing.md)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var recoveryControl: some View {
        let status = identity.state.accountStatus
        if status.canReconnect {
            AtlasPrimaryButton(
                title: isReconnecting ? "Reconnecting…" : "Reconnect Cloud",
                symbol: isReconnecting ? "clock" : "arrow.clockwise",
                action: reconnect
            )
            .disabled(isReconnecting)
            .opacity(isReconnecting ? 0.65 : 1)
            .padding(.top, AtlasTheme.Spacing.lg)
            .accessibilityHint("Refreshes the existing authenticated session and requests device enrollment. It does not execute work or an external action.")
        } else if case .unavailable = identity.state {
            AtlasEmptyState(
                symbol: "rectangle.dashed",
                title: "Cloud configuration is absent",
                detail: "Add a valid HTTPS AtlasControlPlaneURL in a controlled build configuration before enabling Cloud workspaces."
            )
        }
    }

    private var controlPlaneLabel: String {
        if case .unavailable = identity.state { return "Not configured in this build" }
        return "Configured HTTPS endpoint"
    }

    private var deviceTrustLabel: String {
        if case .enrolled(let deviceTrust) = identity.state { return "Enrolled · \(deviceTrust) trust" }
        return "Not enrolled for Atlas Cloud"
    }

    private func reconnect() {
        Task { @MainActor in
            isReconnecting = true
            defer { isReconnecting = false }
            try? await identity.restoreAndEnroll()
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

private struct AtlasAuditTrailView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
                    Text("Audit trail")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                    Text("A read-only accountability record for reviews, challenges, and confirmations. Atlas records intent here; it does not execute an action.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                }

                AtlasSectionHeader("Accountability record", detail: summary)
                content
            }
            .navigationBarHidden(true)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: { dismiss() })
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Refresh") {
                        Task { @MainActor in await store.loadAuditReceipts() }
                    }
                }
            }
            .task { await store.loadAuditReceipts() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoadingAuditReceipts && store.auditReceipts.isEmpty {
            ProgressView("Loading accountability record…")
                .frame(maxWidth: .infinity, minHeight: 160)
                .tint(AtlasTheme.ColorToken.moss)
        } else if let error = store.auditReceiptError {
            AtlasEmptyState(symbol: "exclamationmark.shield", title: "Audit trail unavailable", detail: error)
        } else if store.auditReceipts.isEmpty {
            AtlasEmptyState(symbol: "checkmark.seal", title: "No accountability records yet", detail: "Reviews, confirmation challenges, and recorded intent will appear here as work reaches a policy boundary.")
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(store.auditReceipts) { receipt in
                    AtlasAuditReceiptRow(receipt: receipt)
                    if receipt.id != store.auditReceipts.last?.id { AtlasRule() }
                }
            }
        }
    }

    private var summary: String {
        let count = store.auditReceipts.count
        return "\(count) record\(count == 1 ? "" : "s") · read only · no action executed"
    }
}

private struct AtlasAuditReceiptRow: View {
    let receipt: AtlasAuditReceipt

    var body: some View {
        HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
            Image(systemName: receipt.eventType.symbol)
                .font(.title3)
                .foregroundStyle(receipt.isNonExecuting ? AtlasTheme.ColorToken.moss : AtlasTheme.ColorToken.clay)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 5) {
                Text(receipt.eventType.label)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(receipt.eventType.detail)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                HStack(spacing: AtlasTheme.Spacing.sm) {
                    Text("NO ACTION EXECUTED")
                        .font(AtlasTheme.Type.proof)
                        .tracking(0.7)
                        .foregroundStyle(AtlasTheme.ColorToken.moss)
                    Text(receipt.occurredAt.formatted(.relative(presentation: .named)).uppercased())
                        .font(AtlasTheme.Type.proof)
                        .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                }
            }
            Spacer(minLength: 0)
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
    let created: (String, String) async -> AtlasDraftOperation
    let viewPreparedWork: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var brief: String
    @State private var outcome = ""
    @State private var operation: AtlasDraftOperation = .idle

    init(
        posture: AtlasExecutionPosture,
        initialBrief: String = "",
        created: @escaping (String, String) async -> AtlasDraftOperation,
        viewPreparedWork: @escaping () -> Void
    ) {
        self.posture = posture
        self.created = created
        self.viewPreparedWork = viewPreparedWork
        _brief = State(initialValue: initialBrief)
    }

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

                preparationFeedback
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: { dismiss() })
                }
            }
        }
    }

    @ViewBuilder
    private var preparationFeedback: some View {
        switch operation {
        case .idle:
            prepareButton
        case .preparing:
            AtlasPrimaryButton(title: "Preparing work…", symbol: "clock", action: {})
                .disabled(true)
                .opacity(0.65)
                .padding(.top, AtlasTheme.Spacing.lg)
                .accessibilityLabel("Preparing work")
        case .prepared(let receipt):
            VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                AtlasStudioBlock(
                    kind: "WORK PREPARED",
                    symbol: "checkmark.seal.fill",
                    title: receipt.title,
                    detail: receipt.detail,
                    accent: AtlasTheme.ColorToken.moss
                )
                AtlasPrimaryButton(title: "View prepared work", symbol: "checklist", action: {
                    viewPreparedWork()
                    dismiss()
                })
                .accessibilityHint("Opens the Work runbook. The record is prepared only and has not executed a task.")
            }
            .padding(.top, AtlasTheme.Spacing.lg)
        case .failed(let message):
            VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                AtlasStudioBlock(
                    kind: "PREPARATION NOT RECORDED",
                    symbol: "exclamationmark.shield.fill",
                    title: "Work could not be prepared",
                    detail: message,
                    accent: AtlasTheme.ColorToken.clay
                )
                prepareButton(title: "Try again", symbol: "arrow.clockwise")
            }
            .padding(.top, AtlasTheme.Spacing.lg)
        }
    }

    private var prepareButton: some View {
        prepareButton(title: "Prepare work", symbol: "arrow.right")
    }

    private func prepareButton(title: String, symbol: String) -> some View {
        AtlasPrimaryButton(title: title, symbol: symbol, action: prepareWork)
            .disabled(brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
            .padding(.top, AtlasTheme.Spacing.lg)
    }

    private func prepareWork() {
        let trimmedBrief = brief.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedOutcome = outcome.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBrief.isEmpty else { return }
        operation = .preparing
        Task { @MainActor in
            operation = await created(trimmedBrief, trimmedOutcome)
        }
    }
}

private struct AtlasDecisionReviewSheet: View {
    let decision: AtlasDecision
    @EnvironmentObject private var store: AtlasWorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var challenge: AtlasActionChallenge?
    @State private var receipt: AtlasDecisionConfirmationReceipt?
    @State private var isWorking = false
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            AtlasPage(focus: true) {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                    AtlasSectionHeader("Decision review", detail: "Review, challenge, and confirmation are separate accountability steps.", focus: true)
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

                    AtlasSectionHeader("Evidence", detail: "Review the record before requesting a confirmation challenge.", focus: true)
                    Text(decision.evidenceSummary)
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.focusMutedInk)

                    confirmationControl

                    if let localError {
                        Text(localError)
                            .font(AtlasTheme.Type.body)
                            .foregroundStyle(AtlasTheme.ColorToken.clay)
                    }
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

    @ViewBuilder
    private var confirmationControl: some View {
        if let receipt {
            AtlasStudioBlock(
                kind: "CONFIRMATION RECORDED",
                symbol: "checkmark.seal.fill",
                title: receipt.isNonExecuting ? "Intent recorded — not executed" : "Confirmation recorded",
                detail: receipt.isNonExecuting
                    ? "The control plane stored a receipt only. No external action, dispatch, publication, or approval was executed."
                    : "The control plane recorded this confirmation.",
                accent: AtlasTheme.ColorToken.moss
            )
        } else if let challenge {
            VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                AtlasDecisionFact(label: "Server challenge", value: challenge.statement)
                AtlasDecisionFact(label: "Challenge expires", value: challenge.expiresAt.formatted(.relative(presentation: .named)))
                focusButton(
                    title: challenge.requiresLocalAuthentication ? "Confirm with Face ID" : "Record confirmation",
                    symbol: challenge.requiresLocalAuthentication ? "faceid" : "checkmark.shield"
                ) {
                    confirm(challenge)
                }
                .accessibilityHint("Records a confirmation receipt only. It does not execute an external action.")
            }
        } else {
            focusButton(title: "Record review & request challenge", symbol: "checkmark.shield") {
                requestChallenge()
            }
            .accessibilityHint("Records your review, then requests a short-lived server confirmation challenge. No action is executed.")
        }
    }

    private func focusButton(title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(isWorking ? "Working…" : title, systemImage: isWorking ? "clock" : symbol)
                .font(AtlasTheme.Type.section)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AtlasTheme.Spacing.md)
        }
        .foregroundStyle(AtlasTheme.ColorToken.focusCanvas)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
        .padding(.top, AtlasTheme.Spacing.md)
        .disabled(isWorking)
    }

    private func requestChallenge() {
        Task { @MainActor in
            isWorking = true
            defer { isWorking = false }
            challenge = await store.prepareActionConfirmation(decision)
        }
    }

    private func confirm(_ challenge: AtlasActionChallenge) {
        Task { @MainActor in
            isWorking = true
            defer { isWorking = false }
            do {
                if challenge.requiresLocalAuthentication {
                    try await AtlasLocalAuthenticator().authenticate(reason: challenge.statement)
                }
                receipt = await store.recordActionConfirmation(decision: decision, challenge: challenge)
            } catch {
                localError = error.localizedDescription
            }
        }
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
