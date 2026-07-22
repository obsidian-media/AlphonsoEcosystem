import XCTest
@testable import AlphonsoCompanion

final class OperationsSnapshotTests: XCTestCase {
    func testDecodesActiveWorkAndRecentOutcome() {
        let snapshot = OperationsSnapshot(dictionary: [
            "operations": [
                "activeWork": [[
                    "id": "receipt-running", "title": "Publish release notes", "agent": "jose", "status": "running", "commandId": "command-1", "timestampMs": 1_700_000_000_000,
                ]],
                "recentOutcomes": [[
                    "id": "receipt-complete", "summary": "Release verified", "agent": "maria", "status": "completed", "timestampMs": 1_700_000_010_000,
                ]],
            ],
        ])
        XCTAssertEqual(snapshot?.activeWork.first?.commandID, "command-1")
        XCTAssertEqual(snapshot?.recentOutcomes.first?.summary, "Release verified")
    }

    func testEmptyOperationsResponseIsAnHonestEmptySnapshot() {
        XCTAssertEqual(OperationsSnapshot(dictionary: ["operations": [:]]), .empty)
    }

    func testMissingOperationsEnvelopeDoesNotReplaceExistingSnapshot() {
        XCTAssertNil(OperationsSnapshot(dictionary: ["status": "running"]))
    }
}
