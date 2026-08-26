import SwiftUI

/// The initial full-mobile product shell. Content is intentionally fixture-backed until
/// the typed cloud control-plane contracts are available in the next increment.
struct AtlasMobileRoot: View {
    let openLegacyCompanion: () -> Void
    @State private var selection: AtlasDestination = .home
    @State private var selectedPosture: AtlasExecutionPosture = .cloud
    @State private var showingCreateWork = false

    var body: some View {
        TabView(selection: $selection) {
            AtlasHomeView(posture: $selectedPosture, createWork: { showingCreateWork = true })
                .tabItem { Label("Home", systemImage: "house") }
                .tag(AtlasDestination.home)

            AtlasWorkView(posture: selectedPosture, createWork: { showingCreateWork = true })
                .tabItem { Label("Work", systemImage: "checklist") }
                .tag(AtlasDestination.work)

            AtlasInboxView()
                .tabItem { Label("Inbox", systemImage: "tray") }
                .badge(1)
                .tag(AtlasDestination.inbox)

            AtlasChatStudioView(posture: selectedPosture, createWork: { showingCreateWork = true })
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                .tag(AtlasDestination.chat)

            AtlasMoreView(openLegacyCompanion: openLegacyCompanion)
                .tabItem { Label("More", systemImage: "square.grid.2x2") }
                .tag(AtlasDestination.more)
        }
        .tint(AtlasTheme.ColorToken.moss)
        .sheet(isPresented: $showingCreateWork) {
            AtlasCreateWorkSheet(posture: selectedPosture) {
                showingCreateWork = false
                selection = .work
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
    @Binding var posture: AtlasExecutionPosture
    let createWork: () -> Void
    @State private var showingDecision = false

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
            .sheet(isPresented: $showingDecision) {
                AtlasDecisionReviewSheet()
                    .presentationDetents([.large])
            }
        }
    }

    private var workspaceRibbon: some View {
        Menu {
            ForEach(AtlasExecutionPosture.allCases) { value in
                Button {
                    posture = value
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
                    Text("Northstar Workspace")
                        .font(AtlasTheme.Type.section)
                }
                Spacer()
                AtlasPostureBadge(posture, freshness: "Synced now")
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
            Text("One decision is ready. Two workstreams are moving with verified workspace context.")
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .padding(.top, AtlasTheme.Spacing.xl)
    }

    private var nextDecision: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
            AtlasSectionHeader("Next decision", detail: "Expires in 18 minutes")
            Button { showingDecision = true } label: {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Approve the release brief")
                                .font(AtlasTheme.Type.title)
                            Text("A reviewed launch brief is ready to move to the distribution queue.")
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
                        Text("POLICY / P-017")
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
            .accessibilityHint("Opens the release brief evidence review")
        }
    }

    private var activeWork: some View {
        VStack(alignment: .leading, spacing: 0) {
            AtlasSectionHeader("Active work", detail: "Verified workspace activity")
            AtlasLedgerRow(
                title: "Competitive research synthesis",
                detail: "Hector is consolidating eight verified sources into a decision brief.",
                stamp: "UPDATED 2M AGO",
                status: .executing,
                posture: posture,
                action: {}
            )
            AtlasLedgerRow(
                title: "Product launch sequence",
                detail: "Jose is waiting for the final release brief approval.",
                stamp: "WAITING ON YOU",
                status: .waiting,
                posture: posture,
                action: { showingDecision = true }
            )
        }
    }

    private var recentOutcomes: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            AtlasSectionHeader("Since you last checked")
            AtlasEmptyState(
                symbol: "checkmark.seal",
                title: "Research archive updated",
                detail: "Nine verified findings were added to the Northstar workspace and linked to their source trail."
            )
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
    let posture: AtlasExecutionPosture
    let createWork: () -> Void
    @State private var selectedSegment = 0

    var body: some View {
        NavigationStack {
            AtlasPage {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
                    AtlasPostureBadge(posture, freshness: "Synced now")
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

                if selectedSegment == 0 {
                    activeLedger
                } else {
                    AtlasEmptyState(
                        symbol: selectedSegment == 1 ? "calendar" : "archivebox",
                        title: selectedSegment == 1 ? "No planned work yet" : "Your work library is ready",
                        detail: selectedSegment == 1 ? "Create a brief or schedule a workflow to build the next run." : "Completed work and approved artifacts will be collected here."
                    )
                    .padding(.top, AtlasTheme.Spacing.lg)
                }

                AtlasPrimaryButton(title: "Create work", symbol: "plus", action: createWork)
                    .padding(.top, AtlasTheme.Spacing.lg)
            }
            .navigationBarHidden(true)
        }
    }

    private var activeLedger: some View {
        VStack(alignment: .leading, spacing: 0) {
            AtlasSectionHeader("Runbook", detail: "Open a record to inspect intent, evidence, and next action.")
            AtlasLedgerRow(
                title: "Competitive research synthesis",
                detail: "Plan confirmed · evidence collection in progress · 8 of 12 sources verified.",
                stamp: "RUN / RS-204",
                status: .executing,
                posture: posture,
                action: {}
            )
            AtlasLedgerRow(
                title: "Approve the release brief",
                detail: "A required decision will move the prepared distribution sequence forward.",
                stamp: "RUN / RL-018",
                status: .awaitingDecision,
                posture: posture,
                action: {}
            )
            AtlasLedgerRow(
                title: "Workspace access review",
                detail: "A routine permissions review is scheduled after the current launch window.",
                stamp: "RUN / SC-041",
                status: .planned,
                posture: posture,
                action: {}
            )
        }
    }
}

private struct AtlasInboxView: View {
    @State private var reviewing = false

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

                AtlasSectionHeader("Needs your judgement", detail: "1 decision · high impact")
                Button { reviewing = true } label: {
                    HStack(alignment: .top, spacing: AtlasTheme.Spacing.md) {
                        Image(systemName: "exclamationmark.shield")
                            .font(.title3)
                            .foregroundStyle(AtlasTheme.ColorToken.clay)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Approve the release brief")
                                .font(AtlasTheme.Type.title)
                            Text("Distribution queue · scheduled public communication · expires in 18 minutes")
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

                AtlasSectionHeader("Cleared")
                AtlasEmptyState(
                    symbol: "checkmark.circle",
                    title: "No other decisions are waiting",
                    detail: "Alphonso will surface exceptions, approvals, and assigned follow-ups here."
                )
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $reviewing) {
                AtlasDecisionReviewSheet()
                    .presentationDetents([.large])
            }
        }
    }
}

private struct AtlasChatStudioView: View {
    let posture: AtlasExecutionPosture
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

    private var context: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.xs) {
            HStack {
                Text("Chat")
                    .font(AtlasTheme.Type.display)
                Spacer()
                AtlasPostureBadge(posture, freshness: "Live")
            }
            Text("Launch brief / Distribution readiness")
                .font(AtlasTheme.Type.section)
                .foregroundStyle(AtlasTheme.ColorToken.moss)
            Text("A working studio. Direction, proof, and outcomes stay connected to the same run.")
                .font(AtlasTheme.Type.body)
                .foregroundStyle(AtlasTheme.ColorToken.mutedInk)
        }
        .foregroundStyle(AtlasTheme.ColorToken.ink)
    }

    private var planBlock: some View {
        AtlasStudioBlock(
            kind: "PLAN",
            symbol: "list.bullet.clipboard",
            title: "Jose has prepared the release sequence",
            detail: "Review the audience, content package, channels, and approval conditions before moving this work forward.",
            accent: AtlasTheme.ColorToken.cobalt
        )
    }

    private var evidenceBlock: some View {
        AtlasStudioBlock(
            kind: "EVIDENCE",
            symbol: "checkmark.shield",
            title: "Verification is complete",
            detail: "Source claims and required campaign assets were checked against the workspace launch checklist at 10:42 AM.",
            accent: AtlasTheme.ColorToken.moss
        )
    }

    private var outcomeBlock: some View {
        VStack(alignment: .leading, spacing: AtlasTheme.Spacing.sm) {
            AtlasStudioBlock(
                kind: "NEXT ACTION",
                symbol: "exclamationmark.shield",
                title: "A decision is required",
                detail: "Open the review sheet to inspect impact, policy, and the distribution target before approval.",
                accent: AtlasTheme.ColorToken.clay
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
                    input = ""
                } label: {
                    Image(systemName: input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "arrow.up.circle" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AtlasTheme.ColorToken.quietInk : AtlasTheme.ColorToken.moss)
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send direction")
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
    let created: () -> Void
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
                    created()
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
    @Environment(\.dismiss) private var dismiss
    @State private var confirmed = false

    var body: some View {
        NavigationStack {
            AtlasPage(focus: true) {
                VStack(alignment: .leading, spacing: AtlasTheme.Spacing.md) {
                    AtlasSectionHeader("Decision review", detail: "A higher-impact action requires a deliberate review.", focus: true)
                    Text("Approve the release brief")
                        .font(AtlasTheme.Type.display)
                        .foregroundStyle(AtlasTheme.ColorToken.focusInk)
                    AtlasStatusLabel(.awaitingDecision, focus: true)
                    AtlasRule(focus: true)

                    AtlasDecisionFact(label: "What will happen", value: "The reviewed launch brief moves to the distribution queue.")
                    AtlasDecisionFact(label: "Affected resource", value: "Northstar / Release communications")
                    AtlasDecisionFact(label: "Execution location", value: "Cloud workspace · verified distribution integration")
                    AtlasDecisionFact(label: "Why review is required", value: "External communication policy P-017 requires an accountable operator approval.")
                    AtlasDecisionFact(label: "Expires", value: "18 minutes from the last policy verification")

                    AtlasSectionHeader("Evidence", detail: "Review the record before confirming.", focus: true)
                    Text("All required source claims and campaign assets passed the workspace launch checklist at 10:42 AM. No unresolved policy exceptions are present.")
                        .font(AtlasTheme.Type.body)
                        .foregroundStyle(AtlasTheme.ColorToken.focusMutedInk)

                    Button {
                        confirmed = true
                    } label: {
                        Label(confirmed ? "Approval recorded" : "Confirm with Face ID", systemImage: confirmed ? "checkmark.seal.fill" : "faceid")
                            .font(AtlasTheme.Type.section)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, AtlasTheme.Spacing.md)
                    }
                    .foregroundStyle(AtlasTheme.ColorToken.focusCanvas)
                    .background(confirmed ? AtlasTheme.ColorToken.focusMutedInk : AtlasTheme.ColorToken.sheet)
                    .clipShape(RoundedRectangle(cornerRadius: AtlasTheme.Radius.control, style: .continuous))
                    .padding(.top, AtlasTheme.Spacing.md)
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
