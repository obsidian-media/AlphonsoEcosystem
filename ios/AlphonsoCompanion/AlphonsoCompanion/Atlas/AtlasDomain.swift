import Combine
import Foundation

// MARK: - Workspace

struct AtlasWorkspace: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let posture: AtlasExecutionPosture
    let memberRole: String
}

enum AtlasFreshness: Codable, Equatable {
    case current
    case delayed(minutes: Int)
    case offline(lastConfirmedAt: Date)

    var label: String {
        switch self {
        case .current:
            return "Synced now"
        case .delayed(let minutes):
            return "Updated \(minutes)m ago"
        case .offline(let date):
            return "Last confirmed \(date.formatted(.relative(presentation: .named)))"
        }
    }

    var isActionable: Bool {
        if case .offline = self { return false }
        return true
    }
}

// MARK: - Work

enum AtlasRunPhase: String, Codable, CaseIterable, Equatable {
    case planned
    case awaitingApproval
    case queued
    case executing
    case waitingOnDependency
    case succeeded
    case failed
    case cancelled

    private var wireValue: String {
        switch self {
        case .planned: return "planned"
        case .awaitingApproval: return "awaiting_approval"
        case .queued: return "queued"
        case .executing: return "executing"
        case .waitingOnDependency: return "waiting_on_dependency"
        case .succeeded: return "succeeded"
        case .failed: return "failed"
        case .cancelled: return "cancelled"
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self).lowercased()
        guard let phase = Self.allCases.first(where: { $0.wireValue == value }) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported run phase: \(value)")
        }
        self = phase
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }

    var presentationStatus: AtlasRunStatus {
        switch self {
        case .planned, .queued:
            return .planned
        case .awaitingApproval:
            return .awaitingDecision
        case .executing:
            return .executing
        case .waitingOnDependency:
            return .waiting
        case .succeeded:
            return .delivered
        case .failed, .cancelled:
            return .failed
        }
    }

    var isActive: Bool {
        switch self {
        case .planned, .awaitingApproval, .queued, .executing, .waitingOnDependency:
            return true
        case .succeeded, .failed, .cancelled:
            return false
        }
    }
}

struct AtlasRun: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let owner: String
    let phase: AtlasRunPhase
    let posture: AtlasExecutionPosture
    let updatedAt: Date
    let traceID: String

    var status: AtlasRunStatus { phase.presentationStatus }

    var timestampLabel: String {
        switch phase {
        case .awaitingApproval:
            return "WAITING ON YOU"
        default:
            return "UPDATED \(updatedAt.formatted(.relative(presentation: .named)).uppercased())"
        }
    }

    var phaseLabel: String {
        switch phase {
        case .planned: return "Planned"
        case .awaitingApproval: return "Awaiting decision"
        case .queued: return "Queued"
        case .executing: return "In progress"
        case .waitingOnDependency: return "Waiting on dependency"
        case .succeeded: return "Delivered"
        case .failed: return "Needs attention"
        case .cancelled: return "Cancelled"
        }
    }

    var nextAction: String {
        switch phase {
        case .planned:
            return "Refine the intent and prepare this work for the verified queue."
        case .awaitingApproval:
            return "Review the linked decision and its evidence before recording any confirmation."
        case .queued:
            return "The verified workspace queue will begin this work when its dependencies are ready."
        case .executing:
            return "Monitor the record; Alphonso will attach the next verified update here."
        case .waitingOnDependency:
            return "Resolve the named dependency before this record can continue."
        case .succeeded:
            return "Review the delivered record and retain its trace for future accountability."
        case .failed:
            return "Inspect the record and decide whether to create a new, explicitly scoped run."
        case .cancelled:
            return "This record remains available as an accountability trace; it will not continue."
        }
    }
}

struct AtlasDraftPreparationReceipt: Equatable {
    let run: AtlasRun
    let requiresWorkspaceRefresh: Bool

    init(run: AtlasRun, requiresWorkspaceRefresh: Bool = false) {
        self.run = run
        self.requiresWorkspaceRefresh = requiresWorkspaceRefresh
    }

    var title: String { "Work prepared" }
    var detail: String {
        if requiresWorkspaceRefresh {
            return "\(run.phaseLabel) record \(run.traceID) was accepted in \(run.posture.rawValue). Refresh the authoritative workspace before continuing. This prepares work only; it does not execute a task."
        }
        return "\(run.phaseLabel) record \(run.traceID) is ready in \(run.posture.rawValue). This prepares work only; it does not execute a task."
    }
}

enum AtlasWorkspaceSyncStatus: Equatable {
    case idle
    case refreshing
    case snapshot(freshness: AtlasFreshness, refreshedAt: Date)
    case live(freshness: AtlasFreshness, refreshedAt: Date)
    case failed(String)

    var title: String {
        switch self {
        case .idle: return "Sync paused"
        case .refreshing: return "Refreshing workspace"
        case .snapshot: return "Workspace updated"
        case .live: return "Live workspace"
        case .failed: return "Workspace needs attention"
        }
    }

    var symbol: String {
        switch self {
        case .idle: return "pause.circle"
        case .refreshing: return "arrow.triangle.2.circlepath"
        case .snapshot: return "arrow.down.circle"
        case .live: return "dot.radiowaves.left.and.right"
        case .failed: return "exclamationmark.shield"
        }
    }

    var detail: String {
        switch self {
        case .idle:
            return "Open the workspace to request a fresh briefing."
        case .refreshing:
            return "Requesting an authoritative workspace briefing."
        case .snapshot(let freshness, _):
            return "\(freshness.label). The next refresh will reconcile an authoritative snapshot."
        case .live(let freshness, _):
            return "\(freshness.label). Authenticated workspace updates are reconciling from server snapshots."
        case .failed(let message):
            return message
        }
    }

    var canRefresh: Bool {
        if case .refreshing = self { return false }
        return true
    }

    var isWorking: Bool {
        if case .refreshing = self { return true }
        return false
    }
}

enum AtlasDraftOperation: Equatable {
    case idle
    case preparing
    case prepared(AtlasDraftPreparationReceipt)
    case failed(String)

    var isWorking: Bool {
        if case .preparing = self { return true }
        return false
    }
}

struct AtlasOutcome: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let detail: String
    let completedAt: Date
    let traceID: String

    func matchesLocalQuery(_ query: String) -> Bool {
        AtlasLocalSearch.matches(query, fields: [title, detail, traceID])
    }
}

extension AtlasRun {
    func matchesLocalQuery(_ query: String) -> Bool {
        AtlasLocalSearch.matches(query, fields: [title, summary, owner, phaseLabel, traceID])
    }
}

private enum AtlasLocalSearch {
    static func matches(_ query: String, fields: [String]) -> Bool {
        let terms = query.split(whereSeparator: { $0.isWhitespace })
        guard !terms.isEmpty else { return true }
        let searchableRecord = fields.joined(separator: " ")
        return terms.allSatisfy { term in
            searchableRecord.localizedCaseInsensitiveContains(String(term))
        }
    }
}

// MARK: - Decisions

enum AtlasDecisionRisk: String, Codable, CaseIterable, Equatable {
    case routine
    case elevated
    case high

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self).lowercased()
        guard let risk = Self(rawValue: value) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported decision risk: \(value)")
        }
        self = risk
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var isStepUpRequired: Bool { self == .high }
}

enum AtlasDecisionState: String, Codable, CaseIterable, Equatable {
    case awaitingReview
    case reviewRecordedPendingConfirmation
    case confirmationRecorded
    case approved
    case rejected
    case expired
    case unavailable

    private var wireValue: String {
        switch self {
        case .awaitingReview: return "awaiting_review"
        case .reviewRecordedPendingConfirmation: return "review_recorded_pending_confirmation"
        case .confirmationRecorded: return "confirmation_recorded"
        case .approved: return "approved"
        case .rejected: return "rejected"
        case .expired: return "expired"
        case .unavailable: return "unavailable"
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self).lowercased()
        guard let state = Self.allCases.first(where: { $0.wireValue == value }) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported decision state: \(value)")
        }
        self = state
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }

    var canReview: Bool { self == .awaitingReview }
    var needsConfirmation: Bool { self == .reviewRecordedPendingConfirmation }

    var inboxLabel: String {
        switch self {
        case .awaitingReview: return "Needs review"
        case .reviewRecordedPendingConfirmation: return "Challenge ready"
        case .confirmationRecorded: return "Confirmation recorded"
        case .approved: return "Approved"
        case .rejected: return "Rejected"
        case .expired: return "Expired"
        case .unavailable: return "Unavailable"
        }
    }

    var inboxDetail: String {
        switch self {
        case .awaitingReview: return "Review evidence and policy before requesting a confirmation challenge."
        case .reviewRecordedPendingConfirmation: return "Review is recorded; request a fresh server challenge before confirmation."
        case .confirmationRecorded: return "A confirmation receipt is recorded. It did not execute an external action."
        case .approved: return "This decision is approved in the authoritative workspace record."
        case .rejected: return "This decision was rejected and remains available as an accountability record."
        case .expired: return "This decision expired before a confirmation record was accepted."
        case .unavailable: return "This decision record is currently unavailable. Refresh the workspace before acting."
        }
    }

    var inboxStatus: AtlasRunStatus {
        switch self {
        case .awaitingReview, .reviewRecordedPendingConfirmation: return .awaitingDecision
        case .confirmationRecorded, .approved: return .delivered
        case .rejected, .expired, .unavailable: return .failed
        }
    }
}

struct AtlasActionChallenge: Codable, Equatable, Identifiable {
    let id: String
    let decisionID: String
    let policyCode: String
    let statement: String
    let requiresLocalAuthentication: Bool
    let expiresAt: Date

    func isExpired(at referenceDate: Date = .now) -> Bool {
        expiresAt <= referenceDate
    }
}

struct AtlasDecisionConfirmationReceipt: Codable, Equatable, Identifiable {
    let id: String
    let decision: AtlasDecision
    let executionStatus: String

    var isNonExecuting: Bool { executionStatus == "not_executed" }
}

enum AtlasAuditEventType: String, Codable, CaseIterable, Equatable {
    case reviewRecorded = "review_recorded"
    case challengeIssued = "challenge_issued"
    case confirmationRecorded = "confirmation_recorded"

    var label: String {
        switch self {
        case .reviewRecorded: return "Review recorded"
        case .challengeIssued: return "Challenge issued"
        case .confirmationRecorded: return "Confirmation recorded"
        }
    }

    var detail: String {
        switch self {
        case .reviewRecorded: return "Evidence review was recorded for this decision."
        case .challengeIssued: return "A short-lived device-bound confirmation challenge was issued."
        case .confirmationRecorded: return "Confirmation intent was recorded; no action was executed."
        }
    }

    var symbol: String {
        switch self {
        case .reviewRecorded: return "doc.text.magnifyingglass"
        case .challengeIssued: return "key.viewfinder"
        case .confirmationRecorded: return "checkmark.seal"
        }
    }
}

struct AtlasAuditReceipt: Codable, Equatable, Identifiable {
    let id: String
    let workspaceID: String
    let decisionID: String?
    let challengeID: String?
    let deviceID: String?
    let eventType: AtlasAuditEventType
    let executionStatus: String
    let correlationID: String
    let occurredAt: Date

    var isNonExecuting: Bool { executionStatus == "not_executed" }
}

struct AtlasDecision: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let affectedResource: String
    let executionDetail: String
    let policyCode: String
    let policyReason: String
    let evidenceSummary: String
    let risk: AtlasDecisionRisk
    let state: AtlasDecisionState
    let expiresAt: Date
    let runID: String

    var expiryLabel: String {
        let relative = expiresAt.formatted(.relative(presentation: .named))
        return "Expires \(relative)"
    }

    func matchesLocalQuery(_ query: String) -> Bool {
        AtlasLocalSearch.matches(query, fields: [
            title,
            summary,
            affectedResource,
            executionDetail,
            policyCode,
            policyReason,
            evidenceSummary,
            state.inboxLabel
        ])
    }

    func isActionableExpired(at referenceDate: Date = .now) -> Bool {
        (state.canReview || state.needsConfirmation) && expiresAt <= referenceDate
    }
}

struct AtlasBriefing: Codable, Equatable {
    let workspace: AtlasWorkspace
    let freshness: AtlasFreshness
    let activeRuns: [AtlasRun]
    let outcomes: [AtlasOutcome]
    let decisions: [AtlasDecision]
    let refreshedAt: Date

    var nextDecision: AtlasDecision? {
        decisions.first(where: { $0.state.canReview })
    }
}

// MARK: - Repository seam

protocol AtlasWorkspaceRepository {
    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing
    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun
    func recordDecisionReview(
        workspaceID: String,
        decisionID: String
    ) async throws -> AtlasDecision
    func requestActionChallenge(
        workspaceID: String,
        decisionID: String
    ) async throws -> AtlasActionChallenge
    func recordActionConfirmation(
        workspaceID: String,
        decisionID: String,
        challengeID: String
    ) async throws -> AtlasDecisionConfirmationReceipt
    func loadAuditReceipts(workspaceID: String) async throws -> [AtlasAuditReceipt]
}

extension AtlasWorkspaceRepository {
    func requestActionChallenge(
        workspaceID: String,
        decisionID: String
    ) async throws -> AtlasActionChallenge {
        throw AtlasRepositoryError.decisionUnavailable
    }

    func recordActionConfirmation(
        workspaceID: String,
        decisionID: String,
        challengeID: String
    ) async throws -> AtlasDecisionConfirmationReceipt {
        throw AtlasRepositoryError.decisionUnavailable
    }

    func loadAuditReceipts(workspaceID: String) async throws -> [AtlasAuditReceipt] {
        []
    }
}

enum AtlasRepositoryError: LocalizedError, Equatable {
    case workspaceUnavailable
    case decisionUnavailable

    var errorDescription: String? {
        switch self {
        case .workspaceUnavailable:
            return "This workspace is unavailable. Check the connection and try again."
        case .decisionUnavailable:
            return "This decision is no longer available for review. Refresh the workspace before trying again."
        }
    }
}

/// Fixture-backed repository used until the Cloud control-plane endpoints are implemented.
/// It conforms to the same async contract expected from the future network-backed repository.
struct AtlasFixtureRepository: AtlasWorkspaceRepository {
    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        guard workspaceID == fixtureWorkspace.id else { throw AtlasRepositoryError.workspaceUnavailable }
        return fixtureBriefing
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        guard workspaceID == fixtureWorkspace.id else { throw AtlasRepositoryError.workspaceUnavailable }
        let compactBrief = brief.trimmingCharacters(in: .whitespacesAndNewlines)
        let compactOutcome = desiredOutcome.trimmingCharacters(in: .whitespacesAndNewlines)
        return AtlasRun(
            id: "draft-\(UUID().uuidString.lowercased())",
            title: compactBrief,
            summary: compactOutcome.isEmpty ? "Draft run ready for planning." : compactOutcome,
            owner: "You",
            phase: .planned,
            posture: posture,
            updatedAt: Date(),
            traceID: "DRAFT/\(UUID().uuidString.prefix(8).uppercased())"
        )
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        guard workspaceID == fixtureWorkspace.id,
              let decision = fixtureBriefing.decisions.first(where: { $0.id == decisionID }),
              decision.state.canReview else {
            throw AtlasRepositoryError.decisionUnavailable
        }
        return AtlasDecision(
            id: decision.id,
            title: decision.title,
            summary: decision.summary,
            affectedResource: decision.affectedResource,
            executionDetail: decision.executionDetail,
            policyCode: decision.policyCode,
            policyReason: decision.policyReason,
            evidenceSummary: decision.evidenceSummary,
            risk: decision.risk,
            state: .reviewRecordedPendingConfirmation,
            expiresAt: decision.expiresAt,
            runID: decision.runID
        )
    }

    private var fixtureWorkspace: AtlasWorkspace {
        AtlasWorkspace(
            id: "workspace-northstar",
            name: "Northstar Workspace",
            posture: .cloud,
            memberRole: "Operator"
        )
    }

    private var fixtureBriefing: AtlasBriefing {
        let now = Date()
        let decision = AtlasDecision(
            id: "decision-release-brief",
            title: "Approve the release brief",
            summary: "A reviewed launch brief is ready to move to the distribution queue.",
            affectedResource: "Northstar / Release communications",
            executionDetail: "Cloud workspace · verified distribution integration",
            policyCode: "P-017",
            policyReason: "External communication policy P-017 requires an accountable operator approval.",
            evidenceSummary: "All required source claims and campaign assets passed the workspace launch checklist. No unresolved policy exceptions are present.",
            risk: .high,
            state: .awaitingReview,
            expiresAt: now.addingTimeInterval(18 * 60),
            runID: "run-release-brief"
        )
        let confirmationDecision = AtlasDecision(
            id: "decision-partner-brief",
            title: "Review partner brief exception",
            summary: "The evidence review is recorded and awaits a fresh confirmation challenge.",
            affectedResource: "Northstar / Partner communications",
            executionDetail: "Cloud workspace · scoped external communication review",
            policyCode: "P-024",
            policyReason: "The partner brief exception requires a challenge-bound confirmation record.",
            evidenceSummary: "The exception rationale and partner evidence trail are attached to the workspace record.",
            risk: .elevated,
            state: .reviewRecordedPendingConfirmation,
            expiresAt: now.addingTimeInterval(10 * 60),
            runID: "run-partner-brief"
        )
        let recordedDecision = AtlasDecision(
            id: "decision-research-archive",
            title: "Archive evidence retention",
            summary: "The evidence retention confirmation has been recorded for the completed research archive.",
            affectedResource: "Northstar / Research archive",
            executionDetail: "Cloud workspace · retained accountability evidence",
            policyCode: "P-006",
            policyReason: "Research retention policy requires a recorded accountable confirmation.",
            evidenceSummary: "The source archive is complete and its immutable outcome trace is available in the Work Library.",
            risk: .routine,
            state: .confirmationRecorded,
            expiresAt: now.addingTimeInterval(-600),
            runID: "run-research-synthesis"
        )
        return AtlasBriefing(
            workspace: fixtureWorkspace,
            freshness: .current,
            activeRuns: [
                AtlasRun(
                    id: "run-research-synthesis",
                    title: "Competitive research synthesis",
                    summary: "Hector is consolidating eight verified sources into a decision brief.",
                    owner: "Hector",
                    phase: .executing,
                    posture: .cloud,
                    updatedAt: now.addingTimeInterval(-120),
                    traceID: "RUN/RS-204"
                ),
                AtlasRun(
                    id: "run-release-brief",
                    title: "Product launch sequence",
                    summary: "Jose is waiting for the final release brief approval.",
                    owner: "Jose",
                    phase: .awaitingApproval,
                    posture: .cloud,
                    updatedAt: now.addingTimeInterval(-90),
                    traceID: "RUN/RL-018"
                )
            ],
            outcomes: [
                AtlasOutcome(
                    id: "outcome-research-archive",
                    title: "Research archive updated",
                    detail: "Nine verified findings were added to the Northstar workspace and linked to their source trail.",
                    completedAt: now.addingTimeInterval(-3600),
                    traceID: "OUT/RA-009"
                )
            ],
            decisions: [decision, confirmationDecision, recordedDecision],
            refreshedAt: now
        )
    }
}

@MainActor
final class AtlasWorkspaceStore: ObservableObject {
    @Published private(set) var briefing: AtlasBriefing?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var syncStatus: AtlasWorkspaceSyncStatus = .idle
    @Published private(set) var decisionReviewRecorded = false
    @Published private(set) var confirmationReceipt: AtlasDecisionConfirmationReceipt?
    @Published private(set) var draftOperation: AtlasDraftOperation = .idle
    @Published private(set) var auditReceipts: [AtlasAuditReceipt] = []
    @Published private(set) var auditReceiptsRefreshedAt: Date?
    @Published private(set) var isLoadingAuditReceipts = false
    @Published private(set) var auditReceiptError: String?
    @Published var selectedPosture: AtlasExecutionPosture = .cloud

    private let repository: any AtlasWorkspaceRepository
    private let workspaceID: String
    private var liveSyncTask: Task<Void, Never>?

    init(
        repository: (any AtlasWorkspaceRepository)? = nil,
        workspaceID: String = "workspace-northstar"
    ) {
        self.repository = repository ?? AtlasWorkspaceRepositoryFactory.makeDefault()
        self.workspaceID = workspaceID
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        syncStatus = .refreshing
        defer { isLoading = false }

        do {
            let loadedBriefing = try await repository.loadBriefing(workspaceID: workspaceID)
            briefing = loadedBriefing
            selectedPosture = loadedBriefing.workspace.posture
            decisionReviewRecorded = hasRecordedReview(in: loadedBriefing)
            syncStatus = .snapshot(freshness: loadedBriefing.freshness, refreshedAt: loadedBriefing.refreshedAt)
        } catch {
            let message = error.localizedDescription
            errorMessage = message
            syncStatus = .failed(message)
        }
    }

    func selectPosture(_ posture: AtlasExecutionPosture) {
        selectedPosture = posture
    }

    func loadAuditReceipts() async {
        isLoadingAuditReceipts = true
        auditReceiptError = nil
        defer { isLoadingAuditReceipts = false }
        do {
            auditReceipts = try await repository.loadAuditReceipts(workspaceID: workspaceID)
            auditReceiptsRefreshedAt = Date()
        } catch {
            auditReceiptError = error.localizedDescription
        }
    }

    func startLiveUpdates() {
        guard liveSyncTask == nil,
              let configuration = AtlasCloudConfiguration.fromBundle() else {
            return
        }
        let stream = AtlasWorkspaceEventStream(configuration: configuration)
        liveSyncTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                for try await event in stream.events(workspaceID: self.workspaceID) {
                    if Task.isCancelled { return }
                    self.reconcile(event)
                }
            } catch {
                if !Task.isCancelled {
                    let message = error.localizedDescription
                    self.errorMessage = message
                    self.syncStatus = .failed(message)
                }
            }
            self.liveSyncTask = nil
        }
    }

    func stopLiveUpdates() {
        liveSyncTask?.cancel()
        liveSyncTask = nil
    }

    private func reconcile(_ event: AtlasWorkspaceEvent) {
        guard event.workspaceID == workspaceID else { return }
        briefing = event.briefing
        selectedPosture = event.briefing.workspace.posture
        decisionReviewRecorded = hasRecordedReview(in: event.briefing)
        errorMessage = nil
        syncStatus = .live(freshness: event.briefing.freshness, refreshedAt: event.briefing.refreshedAt)
    }

    func hasRecordedReview(for decisionID: String) -> Bool {
        guard let decision = briefing?.decisions.first(where: { $0.id == decisionID }) else {
            return false
        }
        return decision.state == .reviewRecordedPendingConfirmation || decision.state == .confirmationRecorded
    }

    func isDecisionMissingFromCurrentBriefing(_ decisionID: String) -> Bool {
        guard let briefing else { return false }
        return !briefing.decisions.contains(where: { $0.id == decisionID })
    }

    private func hasRecordedReview(in briefing: AtlasBriefing) -> Bool {
        briefing.decisions.contains {
            $0.state == .reviewRecordedPendingConfirmation || $0.state == .confirmationRecorded
        }
    }

    func resetDraftOperation() {
        draftOperation = .idle
    }

    @discardableResult
    func createDraft(brief: String, desiredOutcome: String) async -> AtlasDraftOperation {
        errorMessage = nil
        draftOperation = .preparing
        do {
            let draft = try await repository.createDraftRun(
                workspaceID: workspaceID,
                brief: brief,
                desiredOutcome: desiredOutcome,
                posture: selectedPosture
            )
            guard var current = briefing else {
                let receipt = AtlasDraftPreparationReceipt(run: draft, requiresWorkspaceRefresh: true)
                draftOperation = .prepared(receipt)
                return draftOperation
            }
            current = AtlasBriefing(
                workspace: current.workspace,
                freshness: current.freshness,
                activeRuns: [draft] + current.activeRuns,
                outcomes: current.outcomes,
                decisions: current.decisions,
                refreshedAt: Date()
            )
            briefing = current
            let receipt = AtlasDraftPreparationReceipt(run: draft)
            draftOperation = .prepared(receipt)
            return draftOperation
        } catch {
            let message = error.localizedDescription
            errorMessage = message
            draftOperation = .failed(message)
            return draftOperation
        }
    }

    deinit {
        liveSyncTask?.cancel()
    }

    func recordDecisionReview(_ decision: AtlasDecision) async {
        errorMessage = nil
        do {
            let reviewed = try await repository.recordDecisionReview(
                workspaceID: workspaceID,
                decisionID: decision.id
            )
            applyDecision(reviewed)
            decisionReviewRecorded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func prepareActionConfirmation(_ decision: AtlasDecision) async -> AtlasActionChallenge? {
        errorMessage = nil
        do {
            let decisionForChallenge: AtlasDecision
            if let currentDecision = briefing?.decisions.first(where: { $0.id == decision.id }),
               currentDecision.state.needsConfirmation {
                decisionForChallenge = currentDecision
            } else {
                let reviewed = try await repository.recordDecisionReview(
                    workspaceID: workspaceID,
                    decisionID: decision.id
                )
                applyDecision(reviewed)
                decisionReviewRecorded = true
                decisionForChallenge = reviewed
            }
            return try await repository.requestActionChallenge(
                workspaceID: workspaceID,
                decisionID: decisionForChallenge.id
            )
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func recordActionConfirmation(
        decision: AtlasDecision,
        challenge: AtlasActionChallenge
    ) async -> AtlasDecisionConfirmationReceipt? {
        errorMessage = nil
        do {
            let receipt = try await repository.recordActionConfirmation(
                workspaceID: workspaceID,
                decisionID: decision.id,
                challengeID: challenge.id
            )
            applyDecision(receipt.decision)
            confirmationReceipt = receipt
            return receipt
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    private func applyDecision(_ updatedDecision: AtlasDecision) {
        guard var current = briefing else { return }
        current = AtlasBriefing(
            workspace: current.workspace,
            freshness: current.freshness,
            activeRuns: current.activeRuns,
            outcomes: current.outcomes,
            decisions: current.decisions.map { $0.id == updatedDecision.id ? updatedDecision : $0 },
            refreshedAt: Date()
        )
        briefing = current
    }
}
