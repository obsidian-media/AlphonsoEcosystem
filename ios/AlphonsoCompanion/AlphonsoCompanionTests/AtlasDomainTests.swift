import XCTest
@testable import AlphonsoCompanion

final class AtlasDomainTests: XCTestCase {
    func testFixtureRepositoryLoadsTypedBriefing() async throws {
        let repository = AtlasFixtureRepository()

        let briefing = try await repository.loadBriefing(workspaceID: "workspace-northstar")

        XCTAssertEqual(briefing.workspace.name, "Northstar Workspace")
        XCTAssertEqual(briefing.workspace.posture, .cloud)
        XCTAssertEqual(briefing.activeRuns.count, 2)
        XCTAssertEqual(briefing.nextDecision?.policyCode, "P-017")
        XCTAssertEqual(briefing.nextDecision?.state, .awaitingReview)
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
