import XCTest
@testable import AlphonsoCompanion

private struct DraftWithoutBriefingRepository: AtlasWorkspaceRepository {
    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        throw AtlasRepositoryError.workspaceUnavailable
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        AtlasRun(
            id: "accepted-draft",
            title: brief,
            summary: desiredOutcome,
            owner: "You",
            phase: .planned,
            posture: posture,
            updatedAt: Date(),
            traceID: "DRAFT/ACCEPTED"
        )
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        throw AtlasRepositoryError.decisionUnavailable
    }
}

private final class ReviewThenChallengeRepository: AtlasWorkspaceRepository {
    private let fixture = AtlasFixtureRepository()
    private(set) var reviewCount = 0
    private var challengeAttemptCount = 0

    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        try await fixture.loadBriefing(workspaceID: workspaceID)
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        try await fixture.createDraftRun(
            workspaceID: workspaceID,
            brief: brief,
            desiredOutcome: desiredOutcome,
            posture: posture
        )
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        reviewCount += 1
        let briefing = try await fixture.loadBriefing(workspaceID: workspaceID)
        guard let decision = briefing.decisions.first(where: { $0.id == decisionID }) else {
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

    func requestActionChallenge(workspaceID: String, decisionID: String) async throws -> AtlasActionChallenge {
        challengeAttemptCount += 1
        if challengeAttemptCount == 1 { throw AtlasRepositoryError.decisionUnavailable }
        return AtlasActionChallenge(
            id: "retry-challenge",
            decisionID: decisionID,
            policyCode: "P-017",
            statement: "Confirm retry challenge",
            requiresLocalAuthentication: true,
            expiresAt: Date().addingTimeInterval(300)
        )
    }
}

private final class DecisionRemovalAfterRefreshRepository: AtlasWorkspaceRepository {
    private let fixture = AtlasFixtureRepository()
    private var loadCount = 0

    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        let briefing = try await fixture.loadBriefing(workspaceID: workspaceID)
        defer { loadCount += 1 }
        guard loadCount > 0 else { return briefing }
        return AtlasBriefing(
            workspace: briefing.workspace,
            freshness: briefing.freshness,
            activeRuns: briefing.activeRuns,
            outcomes: briefing.outcomes,
            decisions: briefing.decisions.filter { $0.id != "decision-release-brief" },
            refreshedAt: briefing.refreshedAt
        )
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        try await fixture.createDraftRun(
            workspaceID: workspaceID,
            brief: brief,
            desiredOutcome: desiredOutcome,
            posture: posture
        )
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        throw AtlasRepositoryError.decisionUnavailable
    }
}

private struct DecisionFailureRepository: AtlasWorkspaceRepository {
    private let fixture = AtlasFixtureRepository()

    func loadBriefing(workspaceID: String) async throws -> AtlasBriefing {
        try await fixture.loadBriefing(workspaceID: workspaceID)
    }

    func createDraftRun(
        workspaceID: String,
        brief: String,
        desiredOutcome: String,
        posture: AtlasExecutionPosture
    ) async throws -> AtlasRun {
        try await fixture.createDraftRun(
            workspaceID: workspaceID,
            brief: brief,
            desiredOutcome: desiredOutcome,
            posture: posture
        )
    }

    func recordDecisionReview(workspaceID: String, decisionID: String) async throws -> AtlasDecision {
        throw AtlasRepositoryError.decisionUnavailable
    }
}

final class AtlasDomainTests: XCTestCase {
    func testFixtureRepositoryLoadsTypedBriefing() async throws {
        let repository = AtlasFixtureRepository()

        let briefing = try await repository.loadBriefing(workspaceID: "workspace-northstar")

        XCTAssertEqual(briefing.workspace.name, "Northstar Workspace")
        XCTAssertEqual(briefing.workspace.posture, .cloud)
        XCTAssertEqual(briefing.activeRuns.count, 2)
        XCTAssertEqual(briefing.outcomes.first?.traceID, "OUT/RA-009")
        XCTAssertEqual(briefing.outcomes.first?.title, "Research archive updated")
        XCTAssertEqual(briefing.decisions.map(\.state), [.awaitingReview, .reviewRecordedPendingConfirmation, .confirmationRecorded])
        XCTAssertEqual(briefing.nextDecision?.policyCode, "P-017")
        XCTAssertEqual(briefing.nextDecision?.state, .awaitingReview)
    }

    func testWorkRecordsMatchTypedLocalSearch() async throws {
        let briefing = try await AtlasFixtureRepository().loadBriefing(workspaceID: "workspace-northstar")
        let researchRun = try XCTUnwrap(briefing.activeRuns.first(where: { $0.id == "run-research-synthesis" }))
        let outcome = try XCTUnwrap(briefing.outcomes.first)

        XCTAssertTrue(researchRun.matchesLocalQuery("Hector"))
        XCTAssertTrue(researchRun.matchesLocalQuery("RUN/RS-204"))
        XCTAssertTrue(researchRun.matchesLocalQuery("Hector RUN/RS-204"))
        XCTAssertTrue(outcome.matchesLocalQuery("Nine verified findings"))
        XCTAssertTrue(outcome.matchesLocalQuery("Research nine"))
        XCTAssertFalse(researchRun.matchesLocalQuery("unrelated phrase"))
        XCTAssertTrue(outcome.matchesLocalQuery("   "))
    }

    func testDecisionRecordsMatchTypedLocalSearch() async throws {
        let briefing = try await AtlasFixtureRepository().loadBriefing(workspaceID: "workspace-northstar")
        let reviewDecision = try XCTUnwrap(briefing.decisions.first(where: { $0.id == "decision-release-brief" }))
        let recordedDecision = try XCTUnwrap(briefing.decisions.first(where: { $0.id == "decision-research-archive" }))

        XCTAssertTrue(reviewDecision.matchesLocalQuery("P-017"))
        XCTAssertTrue(reviewDecision.matchesLocalQuery("P-017 Release communications"))
        XCTAssertTrue(recordedDecision.matchesLocalQuery("Research archive"))
        XCTAssertTrue(recordedDecision.matchesLocalQuery("Confirmation recorded"))
        XCTAssertFalse(reviewDecision.matchesLocalQuery("unrelated phrase"))
        XCTAssertTrue(reviewDecision.matchesLocalQuery("   "))
    }

    func testAuditReceiptsMatchTypedLocalSearch() {
        let receipt = AtlasAuditReceipt(
            id: "receipt-123",
            workspaceID: "workspace-northstar",
            decisionID: "decision-release-brief",
            challengeID: "challenge-456",
            deviceID: "device-atlas-001",
            eventType: .challengeIssued,
            executionStatus: "not_executed",
            correlationID: "AUD/CH-204",
            occurredAt: Date(timeIntervalSince1970: 1_000)
        )

        XCTAssertEqual(receipt.evidenceLabel, "DECISION decision-release-brief · TRACE AUD/CH-204")
        XCTAssertFalse(receipt.evidenceLabel.contains("device-atlas"))
        XCTAssertTrue(receipt.matchesLocalQuery("Challenge issued"))
        XCTAssertTrue(receipt.matchesLocalQuery("decision-release device-atlas"))
        XCTAssertTrue(receipt.matchesLocalQuery("AUD/CH-204"))
        XCTAssertFalse(receipt.matchesLocalQuery("unrelated phrase"))
        XCTAssertTrue(receipt.matchesLocalQuery("   "))
    }

    func testDecisionDetectsOnlyActionableExpiry() async throws {
        let briefing = try await AtlasFixtureRepository().loadBriefing(workspaceID: "workspace-northstar")
        let referenceDate = Date(timeIntervalSince1970: 1_000)
        let reviewDecision = try XCTUnwrap(briefing.decisions.first(where: { $0.id == "decision-release-brief" }))
        let recordedDecision = try XCTUnwrap(briefing.decisions.first(where: { $0.id == "decision-research-archive" }))
        let expiredReview = AtlasDecision(
            id: reviewDecision.id,
            title: reviewDecision.title,
            summary: reviewDecision.summary,
            affectedResource: reviewDecision.affectedResource,
            executionDetail: reviewDecision.executionDetail,
            policyCode: reviewDecision.policyCode,
            policyReason: reviewDecision.policyReason,
            evidenceSummary: reviewDecision.evidenceSummary,
            risk: reviewDecision.risk,
            state: reviewDecision.state,
            expiresAt: referenceDate.addingTimeInterval(-1),
            runID: reviewDecision.runID
        )

        XCTAssertTrue(expiredReview.isActionableExpired(at: referenceDate))
        XCTAssertFalse(reviewDecision.isActionableExpired(at: referenceDate))
        XCTAssertFalse(recordedDecision.isActionableExpired(at: referenceDate.addingTimeInterval(10_000_000)))
    }

    func testActionChallengeDetectsExpiryAgainstReferenceDate() {
        let referenceDate = Date(timeIntervalSince1970: 1_000)
        let expired = AtlasActionChallenge(
            id: "challenge-expired",
            decisionID: "decision-release-brief",
            policyCode: "P-017",
            statement: "Recorded confirmation intent only",
            requiresLocalAuthentication: true,
            expiresAt: referenceDate.addingTimeInterval(-1)
        )
        let active = AtlasActionChallenge(
            id: "challenge-active",
            decisionID: "decision-release-brief",
            policyCode: "P-017",
            statement: "Recorded confirmation intent only",
            requiresLocalAuthentication: true,
            expiresAt: referenceDate.addingTimeInterval(1)
        )

        XCTAssertTrue(expired.isExpired(at: referenceDate))
        XCTAssertFalse(active.isExpired(at: referenceDate))
    }

    func testDecisionInboxPresentationStates() {
        XCTAssertTrue(AtlasDecisionState.awaitingReview.canReview)
        XCTAssertEqual(AtlasDecisionState.awaitingReview.inboxLabel, "Needs review")
        XCTAssertEqual(AtlasDecisionState.awaitingReview.inboxStatus, .awaitingDecision)

        XCTAssertTrue(AtlasDecisionState.reviewRecordedPendingConfirmation.needsConfirmation)
        XCTAssertEqual(AtlasDecisionState.reviewRecordedPendingConfirmation.inboxLabel, "Challenge ready")
        XCTAssertEqual(AtlasDecisionState.reviewRecordedPendingConfirmation.inboxStatus, .awaitingDecision)

        XCTAssertEqual(AtlasDecisionState.confirmationRecorded.inboxLabel, "Confirmation recorded")
        XCTAssertEqual(AtlasDecisionState.confirmationRecorded.inboxStatus, .delivered)
        XCTAssertEqual(AtlasDecisionState.expired.inboxStatus, .failed)
    }

    func testFixtureRepositoryRejectsUnknownWorkspace() async {
        let repository = AtlasFixtureRepository()

        do {
            _ = try await repository.loadBriefing(workspaceID: "unknown-workspace")
            XCTFail("Expected an unavailable workspace error")
        } catch let error as AtlasRepositoryError {
            XCTAssertEqual(error, .workspaceUnavailable)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testDraftRunUsesSelectedExecutionPosture() async throws {
        let repository = AtlasFixtureRepository()

        let run = try await repository.createDraftRun(
            workspaceID: "workspace-northstar",
            brief: "  Prepare release notes  ",
            desiredOutcome: "  A reviewed draft  ",
            posture: .hybrid
        )

        XCTAssertEqual(run.title, "Prepare release notes")
        XCTAssertEqual(run.summary, "A reviewed draft")
        XCTAssertEqual(run.phase, .planned)
        XCTAssertEqual(run.posture, .hybrid)
        XCTAssertTrue(run.traceID.hasPrefix("DRAFT/"))
    }

    func testRunDetailGuidanceExplainsAwaitingDecisionWithoutClaimingExecution() async throws {
        let repository = AtlasFixtureRepository()
        let briefing = try await repository.loadBriefing(workspaceID: "workspace-northstar")
        guard let run = briefing.activeRuns.first(where: { $0.id == "run-release-brief" }) else {
            return XCTFail("Expected release brief fixture run")
        }

        XCTAssertEqual(run.phaseLabel, "Awaiting decision")
        XCTAssertEqual(run.status, .awaitingDecision)
        XCTAssertTrue(run.nextAction.contains("Review the linked decision"))
        XCTAssertFalse(run.nextAction.localizedCaseInsensitiveContains("execute"))
    }

    func testRunDetailGuidanceExplainsExecutingRecord() async throws {
        let repository = AtlasFixtureRepository()
        let briefing = try await repository.loadBriefing(workspaceID: "workspace-northstar")
        guard let run = briefing.activeRuns.first(where: { $0.id == "run-research-synthesis" }) else {
            return XCTFail("Expected research fixture run")
        }

        XCTAssertEqual(run.phaseLabel, "In progress")
        XCTAssertEqual(run.status, .executing)
        XCTAssertTrue(run.nextAction.contains("verified update"))
    }

    @MainActor
    func testStoreLoadPublishesAuthoritativeSnapshotSyncStatus() async {
        let store = AtlasWorkspaceStore()
        await store.load()

        guard case .snapshot(let freshness, _) = store.syncStatus else {
            return XCTFail("Expected fixture load to publish a snapshot sync state")
        }
        XCTAssertEqual(freshness, .current)
        XCTAssertTrue(store.syncStatus.canRefresh)
        XCTAssertFalse(store.syncStatus.isWorking)
    }

    func testSyncStatusKeepsLiveAndFailureRecoveryExplicit() {
        let live = AtlasWorkspaceSyncStatus.live(freshness: .current, refreshedAt: Date())
        XCTAssertEqual(live.title, "Live workspace")
        XCTAssertTrue(live.detail.localizedCaseInsensitiveContains("authenticated workspace updates"))
        XCTAssertTrue(live.canRefresh)

        let failed = AtlasWorkspaceSyncStatus.failed("Network unavailable")
        XCTAssertEqual(failed.title, "Workspace needs attention")
        XCTAssertEqual(failed.detail, "Network unavailable")
        XCTAssertTrue(failed.canRefresh)
        XCTAssertFalse(failed.isWorking)
    }

    func testAccountStatusMakesFixtureAndEnrollmentBoundariesExplicit() {
        let fixture = AtlasIdentityService.State.unavailable.accountStatus
        XCTAssertEqual(fixture.title, "Fixture mode")
        XCTAssertFalse(fixture.isConnected)
        XCTAssertFalse(fixture.canReconnect)
        XCTAssertTrue(fixture.detail.localizedCaseInsensitiveContains("not a production"))

        let enrolled = AtlasIdentityService.State.enrolled(deviceTrust: "verified").accountStatus
        XCTAssertEqual(enrolled.title, "Cloud connected")
        XCTAssertTrue(enrolled.isConnected)
        XCTAssertTrue(enrolled.canReconnect)
        XCTAssertTrue(enrolled.detail.contains("verified trust"))
    }

    func testAccountStatusExposesSafeRecoveryForSignedOutAndFailedStates() {
        let signedOut = AtlasIdentityService.State.signedOut.accountStatus
        XCTAssertFalse(signedOut.isConnected)
        XCTAssertTrue(signedOut.canReconnect)
        XCTAssertEqual(signedOut.symbol, "person.crop.circle.badge.questionmark")

        let failed = AtlasIdentityService.State.failed("Session expired").accountStatus
        XCTAssertFalse(failed.isConnected)
        XCTAssertTrue(failed.canReconnect)
        XCTAssertEqual(failed.detail, "Session expired")
    }

    @MainActor
    func testStoreRecordsSuccessfulAuditRefreshTime() async {
        let store = AtlasWorkspaceStore()

        await store.loadAuditReceipts()

        XCTAssertTrue(store.auditReceipts.isEmpty)
        XCTAssertNil(store.auditReceiptError)
        XCTAssertNotNil(store.auditReceiptsRefreshedAt)
    }

    @MainActor
    func testStoreExposesChallengeFailureForReviewRecovery() async {
        let store = AtlasWorkspaceStore(repository: DecisionFailureRepository())
        await store.load()
        guard let decision = store.briefing?.nextDecision else {
            return XCTFail("Expected a reviewable fixture decision")
        }

        let challenge = await store.prepareActionConfirmation(decision)

        XCTAssertNil(challenge)
        XCTAssertEqual(store.errorMessage, AtlasRepositoryError.decisionUnavailable.errorDescription)
    }

    @MainActor
    func testChallengeRetryDoesNotRecordReviewTwice() async {
        let repository = ReviewThenChallengeRepository()
        let store = AtlasWorkspaceStore(repository: repository)
        await store.load()
        guard let decision = store.briefing?.nextDecision else {
            return XCTFail("Expected a reviewable fixture decision")
        }

        let firstAttempt = await store.prepareActionConfirmation(decision)
        XCTAssertNil(firstAttempt)
        XCTAssertEqual(repository.reviewCount, 1)
        XCTAssertEqual(store.briefing?.decisions.first?.state, .reviewRecordedPendingConfirmation)

        let retry = await store.prepareActionConfirmation(decision)
        XCTAssertEqual(retry?.id, "retry-challenge")
        XCTAssertEqual(repository.reviewCount, 1)
    }

    @MainActor
    func testAcceptedDraftWithoutBriefingRequestsRefreshInsteadOfRetry() async {
        let store = AtlasWorkspaceStore(repository: DraftWithoutBriefingRepository())

        let operation = await store.createDraft(
            brief: "Prepare recovery plan",
            desiredOutcome: "A durable draft"
        )

        guard case .prepared(let receipt) = operation else {
            return XCTFail("Expected accepted draft to remain prepared")
        }
        XCTAssertTrue(receipt.requiresWorkspaceRefresh)
        XCTAssertTrue(receipt.detail.localizedCaseInsensitiveContains("refresh the authoritative workspace"))
        XCTAssertNil(store.briefing)
    }

    @MainActor
    func testStoreCreatesPreparedWorkReceiptAndInsertsRun() async {
        let store = AtlasWorkspaceStore()
        await store.load()

        let operation = await store.createDraft(
            brief: "Prepare account plan",
            desiredOutcome: "A reviewed mobile plan"
        )

        guard case .prepared(let receipt) = operation else {
            return XCTFail("Expected a prepared-work receipt")
        }
        XCTAssertEqual(receipt.title, "Work prepared")
        XCTAssertEqual(receipt.run.phase, .planned)
        XCTAssertTrue(receipt.detail.localizedCaseInsensitiveContains("does not execute"))
        XCTAssertEqual(store.briefing?.activeRuns.first?.id, receipt.run.id)
        XCTAssertEqual(store.draftOperation, operation)
    }

    @MainActor
    func testStoreDerivesRecordedReviewStateFromLoadedBriefing() async {
        let store = AtlasWorkspaceStore()

        await store.load()

        XCTAssertTrue(store.decisionReviewRecorded)
    }

    @MainActor
    func testStoreRecognizesDecisionRemovedByAuthoritativeRefresh() async {
        let store = AtlasWorkspaceStore(repository: DecisionRemovalAfterRefreshRepository())

        await store.load()
        XCTAssertFalse(store.isDecisionMissingFromCurrentBriefing("decision-release-brief"))

        await store.load()
        XCTAssertTrue(store.isDecisionMissingFromCurrentBriefing("decision-release-brief"))
        XCTAssertFalse(store.isDecisionMissingFromCurrentBriefing("decision-research-archive"))
    }

    @MainActor
    func testStoreTracksRecordedReviewPerDecision() async {
        let store = AtlasWorkspaceStore()

        await store.load()

        XCTAssertFalse(store.hasRecordedReview(for: "decision-release-brief"))
        XCTAssertTrue(store.hasRecordedReview(for: "decision-partner-brief"))
        XCTAssertTrue(store.hasRecordedReview(for: "decision-research-archive"))
        XCTAssertFalse(store.hasRecordedReview(for: "unknown-decision"))
    }

    @MainActor
    func testStoreRecordsDecisionReviewAndUpdatesBriefing() async {
        let store = AtlasWorkspaceStore()
        await store.load()
        guard let decision = store.briefing?.nextDecision else {
            return XCTFail("Expected fixture briefing to contain a reviewable decision")
        }

        await store.recordDecisionReview(decision)

        XCTAssertTrue(store.decisionReviewRecorded)
        XCTAssertNil(store.briefing?.nextDecision)
        XCTAssertEqual(store.briefing?.decisions.first?.state, .reviewRecordedPendingConfirmation)
    }
}
