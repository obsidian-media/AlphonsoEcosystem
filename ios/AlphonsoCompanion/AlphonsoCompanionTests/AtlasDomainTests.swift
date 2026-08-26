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
