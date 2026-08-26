import Foundation
import XCTest
@testable import AlphonsoCompanion

final class AtlasCloudRepositoryTests: XCTestCase {
    func testConfigurationRequiresHTTPS() throws {
        XCTAssertNil(AtlasCloudConfiguration(baseURL: URL(string: "http://control.alphonso.test")!))
        XCTAssertNil(AtlasCloudConfiguration(baseURL: URL(string: "not a url")!))
        XCTAssertNotNil(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!))
    }

    func testBriefingRequestIsAuthenticatedAndDecodesV1Contract() async throws {
        let transport = StubTransport(data: fixtureBriefingData, statusCode: 200)
        let repository = AtlasCloudRepository(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: transport
        )

        let briefing = try await repository.loadBriefing(workspaceID: "workspace-northstar")

        XCTAssertEqual(briefing.workspace.name, "Northstar Workspace")
        XCTAssertEqual(briefing.workspace.posture, .cloud)
        XCTAssertEqual(briefing.activeRuns.first?.phase, .executing)
        XCTAssertEqual(briefing.activeRuns.first?.traceID, "RUN/RS-204")
        XCTAssertEqual(briefing.nextDecision?.state, .awaitingReview)
        XCTAssertEqual(briefing.nextDecision?.runID, "run-release-brief")

        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.absoluteString, "https://control.alphonso.test/api/v1/workspaces/workspace-northstar/briefing")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer unit-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Alphonso-Device-Id"), "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Alphonso-Client"), "ios")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Alphonso-API-Version"), "v1")
    }

    func testUnauthorizedResponseMapsToSessionError() async throws {
        let transport = StubTransport(data: Data(), statusCode: 401)
        let repository = AtlasCloudRepository(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: transport
        )

        do {
            _ = try await repository.loadBriefing(workspaceID: "workspace-northstar")
            XCTFail("Expected an unauthorized response")
        } catch let error as AtlasCloudRepositoryError {
            XCTAssertEqual(error, .unauthorized)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testCreateDraftUsesTypedSnakeCasePayload() async throws {
        let transport = StubTransport(data: fixtureDraftRunData, statusCode: 201)
        let repository = AtlasCloudRepository(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: transport
        )

        let run = try await repository.createDraftRun(
            workspaceID: "workspace-northstar",
            brief: "Prepare release notes",
            desiredOutcome: "A reviewed draft",
            posture: .hybrid
        )

        XCTAssertEqual(run.id, "run-draft-001")
        XCTAssertEqual(run.phase, .planned)
        XCTAssertEqual(run.posture, .hybrid)
        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://control.alphonso.test/api/v1/workspaces/workspace-northstar/runs/drafts")
        let payload = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: payload) as? [String: String])
        XCTAssertEqual(object["brief"], "Prepare release notes")
        XCTAssertEqual(object["desired_outcome"], "A reviewed draft")
        XCTAssertEqual(object["execution_posture"], "hybrid")
    }

    func testEnrollmentPostsMatchingDeviceHeaderAndPayload() async throws {
        let transport = StubTransport(data: fixtureEnrollmentData, statusCode: 201)
        let client = AtlasEnrollmentClient(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: transport
        )

        let receipt = try await client.enroll(displayName: "Atlas iPhone")

        XCTAssertEqual(receipt.status, "enrolled")
        XCTAssertEqual(receipt.deviceID, "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8")
        XCTAssertEqual(receipt.deviceTrust, "demo_enrolled")
        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://control.alphonso.test/api/v1/devices/enroll")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer unit-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Alphonso-Device-Id"), receipt.deviceID)
        let payload = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: payload) as? [String: String])
        XCTAssertEqual(object["device_id"], receipt.deviceID)
        XCTAssertEqual(object["display_name"], "Atlas iPhone")
    }

    func testActionChallengeAndConfirmationUseTypedV1Contract() async throws {
        let challengeTransport = StubTransport(data: fixtureChallengeData, statusCode: 200)
        let repository = AtlasCloudRepository(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: challengeTransport
        )

        let challenge = try await repository.requestActionChallenge(
            workspaceID: "workspace-northstar",
            decisionID: "decision-release-brief"
        )

        XCTAssertEqual(challenge.id, "challenge-001")
        XCTAssertTrue(challenge.requiresLocalAuthentication)
        XCTAssertEqual(
            challengeTransport.lastRequest?.url?.absoluteString,
            "https://control.alphonso.test/api/v1/workspaces/workspace-northstar/decisions/decision-release-brief/action-challenges"
        )

        let confirmationTransport = StubTransport(data: fixtureConfirmationData, statusCode: 200)
        let confirmationRepository = AtlasCloudRepository(
            configuration: try XCTUnwrap(AtlasCloudConfiguration(baseURL: URL(string: "https://control.alphonso.test")!)),
            accessTokenProvider: StubTokenProvider(token: "unit-token"),
            deviceIdentifierProvider: StubDeviceIdentifierProvider(deviceID: "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8"),
            transport: confirmationTransport
        )

        let receipt = try await confirmationRepository.recordActionConfirmation(
            workspaceID: "workspace-northstar",
            decisionID: "decision-release-brief",
            challengeID: challenge.id
        )

        XCTAssertEqual(receipt.id, "receipt-001")
        XCTAssertTrue(receipt.isNonExecuting)
        XCTAssertEqual(receipt.decision.state, .confirmationRecorded)
        let payload = try XCTUnwrap(confirmationTransport.lastRequest?.httpBody)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: payload) as? [String: Any])
        XCTAssertEqual(object["challenge_id"] as? String, "challenge-001")
        XCTAssertEqual(object["local_authentication_completed"] as? Bool, true)
    }

    private var fixtureChallengeData: Data {
        Data("""
        {
          "id": "challenge-001",
          "decision_id": "decision-release-brief",
          "policy_code": "P-017",
          "statement": "Confirm your reviewed decision. This records intent only; it does not execute an action.",
          "requires_local_authentication": true,
          "status": "pending_confirmation",
          "expires_at": "2026-08-26T15:00:00.000Z"
        }
        """.utf8)
    }

    private var fixtureConfirmationData: Data {
        Data("""
        {
          "receipt_id": "receipt-001",
          "execution_status": "not_executed",
          "decision": {
            "id": "decision-release-brief",
            "title": "Approve the release brief",
            "summary": "Release brief is ready.",
            "affected_resource": "Northstar / Release communications",
            "execution_detail": "Cloud workspace",
            "policy_code": "P-017",
            "policy_reason": "External communication requires review.",
            "evidence_summary": "Verification is complete.",
            "risk": "high",
            "state": "confirmation_recorded",
            "expires_at": "2026-08-26T15:00:00.000Z",
            "run_id": "run-release-brief"
          }
        }
        """.utf8)
    }

    private var fixtureEnrollmentData: Data {
        Data("""
        {
          "status": "enrolled",
          "device_id": "1d0df3b2-4b9c-4c4c-b7d4-06bc88bde2d8",
          "device_trust": "demo_enrolled"
        }
        """.utf8)
    }

    private var fixtureDraftRunData: Data {
        Data("""
        {
          "id": "run-draft-001",
          "title": "Prepare release notes",
          "summary": "A reviewed draft",
          "owner": "You",
          "phase": "planned",
          "posture": "hybrid",
          "updated_at": "2026-08-26T14:40:00.000Z",
          "trace_id": "RUN/DR-001"
        }
        """.utf8)
    }

    private var fixtureBriefingData: Data {
        Data("""
        {
          "workspace": {
            "id": "workspace-northstar",
            "name": "Northstar Workspace",
            "posture": "cloud",
            "member_role": "operator"
          },
          "freshness": { "state": "current" },
          "active_runs": [
            {
              "id": "run-research-synthesis",
              "title": "Competitive research synthesis",
              "summary": "Evidence collection in progress.",
              "owner": "Hector",
              "phase": "executing",
              "posture": "cloud",
              "updated_at": "2026-08-26T14:40:00.000Z",
              "trace_id": "RUN/RS-204"
            }
          ],
          "outcomes": [
            {
              "id": "outcome-research-archive",
              "title": "Research archive updated",
              "detail": "Verified findings were added.",
              "completed_at": "2026-08-26T13:40:00.000Z",
              "trace_id": "OUT/RA-009"
            }
          ],
          "decisions": [
            {
              "id": "decision-release-brief",
              "title": "Approve the release brief",
              "summary": "Release brief is ready.",
              "affected_resource": "Northstar / Release communications",
              "execution_detail": "Cloud workspace",
              "policy_code": "P-017",
              "policy_reason": "External communication requires review.",
              "evidence_summary": "Verification is complete.",
              "risk": "high",
              "state": "awaiting_review",
              "expires_at": "2026-08-26T15:00:00.000Z",
              "run_id": "run-release-brief"
            }
          ],
          "refreshed_at": "2026-08-26T14:40:00.000Z"
        }
        """.utf8)
    }
}

private struct StubTokenProvider: AtlasAccessTokenProvider {
    let token: String

    func accessToken() throws -> String {
        token
    }
}

private struct StubDeviceIdentifierProvider: AtlasDeviceIdentifierProvider {
    let deviceID: String

    func deviceID() throws -> String {
        deviceID
    }
}

private final class StubTransport: AtlasHTTPTransport {
    private let data: Data
    private let statusCode: Int
    private(set) var lastRequest: URLRequest?

    init(data: Data, statusCode: Int) {
        self.data = data
        self.statusCode = statusCode
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        lastRequest = request
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://control.alphonso.test")!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: nil
        )!
        return (data, response)
    }
}
