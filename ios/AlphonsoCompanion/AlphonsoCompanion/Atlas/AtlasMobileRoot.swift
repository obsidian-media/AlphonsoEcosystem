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
                },
                refreshPreparedWork: {
                    showingCreateWork = false
                    selection = .home
                    Task { @MainActor in await store.load() }
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
    @State private var selectedOutcome: AtlasOutcome?

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
            .sheet(item: $selectedOutcome) { outcome in
                AtlasOutcomeDetailSheet(
                    outcome: outcome,
                    posture: store.briefing?.workspace.posture ?? store.selectedPosture
                )
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
        .accessibilityIdentifier("atlas.home.workspaceHealth")
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
                Button { selectedOutcome = outcome } label: {
                    AtlasHomeOutcomeRow(outcome: outcome)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the verified outcome record and its trace")
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

private struct AtlasHomeOutcomeRow: View {
    let outcome: AtlasOutcome

    var body: some View {
        HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
            Image(systemName: "checkmark.seal")
                .font(.title3)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
            VStack(alignment: .leading, spacing: 4) {
                Text(outcome.title)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(outcome.detail)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("OUTCOME · \(outcome.traceID)")
                    .font(AtlasTheme.Type.proof)
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            }
            Spacer(minLength: AtlasTheme.Spacing.xs)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
        }
        .padding(AtlasTheme.Spacing.md)
        .background(AtlasTheme.ColorToken.sheet)
        .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct AtlasWorkView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    let createWork: () -> Void
    @Binding var selectedSegment: Int
    @State private var selectedRun: AtlasRun?
    @State private var selectedOutcome: AtlasOutcome?

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
                .accessibilityIdentifier("atlas.work.segment")
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
        .sheet(item: $selectedOutcome) { outcome in
            AtlasOutcomeDetailSheet(
                outcome: outcome,
                posture: store.briefing?.workspace.posture ?? store.selectedPosture
            )
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
            return []
        }
    }

    @ViewBuilder
    private var runLedger: some View {
        if selectedSegment == 2 {
            outcomeLibrary
        } else {
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
    }

    private var outcomeLibrary: some View {
        VStack(alignment: .leading, spacing: 0) {
            AtlasSectionHeader("Verified outcomes", detail: "Delivered workspace records with traceable source context.")
            if let outcomes = store.briefing?.outcomes, !outcomes.isEmpty {
                ForEach(outcomes) { outcome in
                    Button { selectedOutcome = outcome } label: {
                        AtlasOutcomeRow(outcome: outcome)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the verified outcome record and its trace")
                    if outcome.id != outcomes.last?.id { AtlasRule() }
                }
            } else {
                AtlasEmptyState(
                    symbol: "archivebox",
                    title: "No verified outcomes yet",
                    detail: "Delivered workspace outcomes will appear here with their trace records."
                )
                .padding(.top, AtlasTheme.Spacing.sm)
            }
        }
    }

    private var sectionTitle: String {
        switch selectedSegment {
        case 0: return "Runbook"
        case 1: return "Planned work"
        default: return "Verified outcomes"
        }
    }

    private var emptySymbol: String {
        selectedSegment == 2 ? "archivebox" : selectedSegment == 1 ? "calendar" : "bolt.slash"
    }

    private var emptyTitle: String {
        selectedSegment == 2 ? "No verified outcomes yet" : selectedSegment == 1 ? "No planned work yet" : "No active work"
    }

    private var emptyDetail: String {
        selectedSegment == 2 ? "Delivered workspace outcomes will appear here with their trace records." : selectedSegment == 1 ? "Create a brief or schedule a workflow to build the next run." : "New workspace activity will appear here as it begins."
    }
}

private struct AtlasOutcomeRow: View {
    let outcome: AtlasOutcome

    var body: some View {
        HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
            Image(systemName: "checkmark.seal")
                .font(.title3)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(outcome.title)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text(outcome.detail)
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("COMPLETED \(outcome.completedAt.formatted(.relative(presentation: .named)).uppercased()) · \(outcome.traceID)")
                    .font(AtlasTheme.Type.proof)
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            }
            Spacer(minLength: AtlasTheme.Spacing.xs)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
        }
        .padding(.vertical, AtlasTheme.Spacing.md)
        .accessibilityElement(children: .combine)
    }
}

private struct AtlasOutcomeDetailSheet: View {
    let outcome: AtlasOutcome
    let posture: AtlasExecutionPosture
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    AtlasPostureBadge(posture, freshness: "Verified outcome")
                    Text("Outcome record")
                        .font(AtlasTheme.Type.proof)
                        .tracking(1.1)
                        .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                    Text(outcome.title)
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.ink)
                }

                AtlasRule()
                AtlasSectionHeader("Verified result")
                AtlasRunFact(label: "Outcome", value: outcome.detail)
                AtlasRunFact(label: "Completed", value: outcome.completedAt.formatted(.relative(presentation: .named)))

                AtlasSectionHeader("Record trace", detail: "Reference this immutable identifier when connecting the outcome to workspace evidence.")
                AtlasRunFact(label: "Trace", value: outcome.traceID, monospaced: true)

                AtlasSectionHeader("Accountability")
                Text("This outcome records a verified workspace result. It is not by itself an authorization, execution command, or final external-action receipt.")
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
                if reviewDecisions.isEmpty {
                    AtlasEmptyState(symbol: "checkmark.circle", title: "No decisions are waiting", detail: "Alphonso will surface exceptions, approvals, and assigned follow-ups here.")
                } else {
                    decisionRows(reviewDecisions, actionable: true)
                }

                if !confirmationDecisions.isEmpty {
                    AtlasSectionHeader("Confirmation queue", detail: "These reviews are recorded. Request a fresh server challenge before confirmation.")
                    decisionRows(confirmationDecisions, actionable: true)
                }

                AtlasSectionHeader("Recorded", detail: "Read-only accountability records remain visible here; confirmation records are not external execution.")
                if recordedDecisions.isEmpty {
                    AtlasEmptyState(
                        symbol: store.decisionReviewRecorded ? "checkmark.seal" : "clock",
                        title: store.decisionReviewRecorded ? "Review recorded" : "No recorded decisions in this session",
                        detail: store.decisionReviewRecorded ? "The control-plane handoff is ready for a fresh confirmation challenge." : "Resolved decisions and auditable receipts will appear here."
                    )
                } else {
                    decisionRows(recordedDecisions, actionable: false)
                }
            }
            .navigationBarHidden(true)
            .sheet(item: $selectedDecision) { decision in
                AtlasDecisionReviewSheet(decision: decision)
                    .environmentObject(store)
                    .presentationDetents([.large])
            }
        }
    }

    @ViewBuilder
    private func decisionRows(_ decisions: [AtlasDecision], actionable: Bool) -> some View {
        ForEach(decisions) { decision in
            if actionable {
                Button { selectedDecision = decision } label: {
                    AtlasInboxDecisionRow(decision: decision, showsNavigation: true)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens evidence and policy details. Recording a confirmation does not execute an external action.")
            } else {
                AtlasInboxDecisionRow(decision: decision, showsNavigation: false)
            }
            AtlasRule()
        }
    }

    private var reviewDecisions: [AtlasDecision] {
        (store.briefing?.decisions ?? []).filter(\.state.canReview)
    }

    private var confirmationDecisions: [AtlasDecision] {
        (store.briefing?.decisions ?? []).filter(\.state.needsConfirmation)
    }

    private var recordedDecisions: [AtlasDecision] {
        (store.briefing?.decisions ?? []).filter { !$0.state.canReview && !$0.state.needsConfirmation }
    }

    private var decisionDetail: String {
        let count = reviewDecisions.count
        return "\(count) decision\(count == 1 ? "" : "s") · review before acting"
    }
}

private struct AtlasInboxDecisionRow: View {
    let decision: AtlasDecision
    let showsNavigation: Bool

    var body: some View {
        HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
            Image(systemName: decision.risk == .high ? "exclamationmark.shield" : "checkmark.shield")
                .font(.title3)
                .foregroundStyle(decision.risk == .high ? AtlasTheme.ColorToken.clay : AtlasTheme.ColorToken.amber)
            VStack(alignment: .leading, spacing: 6) {
                Text(decision.title)
                    .font(AtlasTheme.Type.title)
                    .foregroundStyle(AtlasTheme.ColorToken.ink)
                Text("\(decision.affectedResource) · \(decision.expiryLabel)")
                    .font(AtlasTheme.Type.body)
                    .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
                Text(decision.state.inboxDetail)
                    .font(AtlasTheme.Type.metadata)
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                    .fixedSize(horizontal: false, vertical: true)
                AtlasStatusLabel(decision.state.inboxStatus)
            }
            Spacer(minLength: AtlasTheme.Spacing.xs)
            if showsNavigation {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            } else {
                Text(decision.state.inboxLabel.uppercased())
                    .font(AtlasTheme.Type.proof)
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            }
        }
        .padding(.vertical, AtlasTheme.Spacing.md)
        .accessibilityElement(children: .combine)
    }
}

private struct AtlasChatStudioView: View {
    @EnvironmentObject private var store: AtlasWorkspaceStore
    let createWork: (String) -> Void
    @State private var input = ""

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
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
            Text("TYPED DIRECTION")
                .font(AtlasTheme.Type.proof)
                .tracking(1)
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)

            HStack(alignment: .bottom, spacing: AtlasTheme.Spacing.sm) {
                TextField("State the work you want to prepare…", text: $input, axis: .vertical)
                    .font(AtlasTheme.Type.body)
                    .lineLimit(1...4)
                    .padding(.horizontal, AtlasTheme.Spacing.sm)
                    .padding(.vertical, 10)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
                    .accessibilityLabel("Typed direction for a work brief")
                    .accessibilityIdentifier("atlas.chat.direction")

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
                .accessibilityLabel("Turn typed direction into a work brief")
                .accessibilityIdentifier("atlas.chat.prepare")
            }
            Text("Voice capture, file intake, and generated suggestions will appear only when their authenticated mobile contracts are available.")
                .font(AtlasTheme.Type.metadata)
                .foregroundStyle(AtlasTheme.ColorToken.quietInk)
                .fixedSize(horizontal: false, vertical: true)
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
                    AtlasMoreRow(symbol: "person.crop.circle", title: "Account & Cloud", detail: "Session status, device trust, and safe recovery", isNavigable: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("atlas.more.account")
                .accessibilityHint("Opens Atlas account connection and device-trust status")
                AtlasMoreRow(symbol: "person.3", title: "Team", detail: "Role and contribution records are planned with the future Workspace API.")
                AtlasMoreRow(symbol: "bubble.left.and.bubble.right", title: "Boardroom", detail: "Collaborative decision sessions are planned for a later control-plane increment.")
                AtlasMoreRow(symbol: "books.vertical", title: "Knowledge", detail: "Workspace memory and research provenance require the future evidence contract.")

                AtlasSectionHeader("Connections")
                AtlasMoreRow(symbol: "link", title: "Integrations", detail: "Scoped integration health and approved action policies are not enabled in this foundation.")
                AtlasMoreRow(symbol: "desktopcomputer", title: "Local Worker", detail: "Private worker pairing awaits the device-bound Hybrid protocol.")
                Button(action: openAuditTrail) {
                    AtlasMoreRow(symbol: "lock.shield", title: "Security & Devices", detail: "Sessions, device trust, and accountability records", isNavigable: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("atlas.more.auditTrail")
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
    var isNavigable = false

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
            if isNavigable {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            } else {
                Text("PLANNED")
                    .font(AtlasTheme.Type.proof)
                    .foregroundStyle(AtlasTheme.ColorToken.quietInk)
            }
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

private struct AtlasCreateWorkSheet: View {
    let posture: AtlasExecutionPosture
    let created: (String, String) async -> AtlasDraftOperation
    let viewPreparedWork: () -> Void
    let refreshPreparedWork: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var brief: String
    @State private var outcome = ""
    @State private var operation: AtlasDraftOperation = .idle

    init(
        posture: AtlasExecutionPosture,
        initialBrief: String = "",
        created: @escaping (String, String) async -> AtlasDraftOperation,
        viewPreparedWork: @escaping () -> Void,
        refreshPreparedWork: @escaping () -> Void
    ) {
        self.posture = posture
        self.created = created
        self.viewPreparedWork = viewPreparedWork
        self.refreshPreparedWork = refreshPreparedWork
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
                    .accessibilityIdentifier("atlas.create.brief")
                    .lineLimit(3...8)
                    .padding(AtlasTheme.Spacing.md)
                    .background(AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))

                AtlasSectionHeader("Desired outcome")
                TextField("What would a useful result look like?", text: $outcome, axis: .vertical)
                    .font(AtlasTheme.Type.body)
                    .accessibilityIdentifier("atlas.create.outcome")
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
                AtlasPrimaryButton(
                    title: receipt.requiresWorkspaceRefresh ? "Refresh workspace" : "View prepared work",
                    symbol: receipt.requiresWorkspaceRefresh ? "arrow.clockwise" : "checklist",
                    action: {
                        if receipt.requiresWorkspaceRefresh {
                            refreshPreparedWork()
                        } else {
                            viewPreparedWork()
                        }
                        dismiss()
                    }
                )
                .accessibilityHint(receipt.requiresWorkspaceRefresh
                    ? "Refreshes the authoritative workspace after a prepared record was accepted. It does not execute a task."
                    : "Opens the Work runbook. The record is prepared only and has not executed a task.")
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
            .accessibilityIdentifier("atlas.create.prepare")
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
    @State private var localErrorTitle = "Review or challenge was not recorded"
    @State private var needsFreshChallenge = false

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
                        AtlasStudioBlock(
                            kind: "RECOVERY REQUIRED",
                            symbol: "exclamationmark.shield.fill",
                            title: localErrorTitle,
                            detail: localError,
                            accent: AtlasTheme.ColorToken.clay
                        )
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
            focusButton(
                title: needsFreshChallenge ? "Request a new confirmation challenge" : "Record review & request challenge",
                symbol: needsFreshChallenge ? "arrow.clockwise" : "checkmark.shield"
            ) {
                requestChallenge()
            }
            .accessibilityHint(needsFreshChallenge
                ? "Requests a fresh short-lived server challenge after a confirmation failure. No action is executed."
                : "Records your review, then requests a short-lived server confirmation challenge. No action is executed.")
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
        localError = nil
        localErrorTitle = "Review or challenge was not recorded"
        Task { @MainActor in
            isWorking = true
            defer { isWorking = false }
            challenge = await store.prepareActionConfirmation(decision)
            if challenge == nil {
                needsFreshChallenge = store.decisionReviewRecorded
                localErrorTitle = store.decisionReviewRecorded ? "Challenge was not issued" : "Review or challenge was not recorded"
                localError = store.errorMessage ?? "Atlas could not record this review or request a confirmation challenge. Refresh the workspace and try again."
            } else {
                needsFreshChallenge = false
            }
        }
    }

    private func confirm(_ challenge: AtlasActionChallenge) {
        localError = nil
        localErrorTitle = "Confirmation was not recorded"
        Task { @MainActor in
            isWorking = true
            defer { isWorking = false }
            do {
                if challenge.requiresLocalAuthentication {
                    try await AtlasLocalAuthenticator().authenticate(reason: challenge.statement)
                }
                receipt = await store.recordActionConfirmation(decision: decision, challenge: challenge)
                if receipt == nil {
                    challenge = nil
                    needsFreshChallenge = true
                    localError = store.errorMessage ?? "Atlas could not record this confirmation. Refresh the workspace and request a new challenge if needed."
                }
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
