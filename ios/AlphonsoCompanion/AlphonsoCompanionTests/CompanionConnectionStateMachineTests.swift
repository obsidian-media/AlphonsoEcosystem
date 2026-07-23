import XCTest
@testable import AlphonsoCompanion

final class CompanionConnectionStateMachineTests: XCTestCase {
    func testManualDisconnectStopsReconnect() {
        var machine = CompanionConnectionStateMachine()

        machine.startConnecting()
        machine.disconnectManually()

        XCTAssertEqual(machine.connectionState, .disconnected)
        XCTAssertFalse(machine.shouldReconnect)
        XCTAssertEqual(machine.reconnectDelay, 1.0)
    }

    func testTransportFailureKeepsReconnectEnabled() {
        var machine = CompanionConnectionStateMachine()

        machine.startConnecting()
        machine.markTransportFailure()

        XCTAssertEqual(machine.connectionState, .failed)
        XCTAssertTrue(machine.shouldReconnect)
    }

    func testInvalidPinDisablesReconnect() {
        var machine = CompanionConnectionStateMachine()

        machine.startConnecting()
        machine.markInvalidPin()

        XCTAssertEqual(machine.connectionState, .disconnected)
        XCTAssertFalse(machine.shouldReconnect)
        XCTAssertEqual(machine.reconnectDelay, 1.0)
    }

    func testReconnectBackoffDoublesAndCaps() {
        var machine = CompanionConnectionStateMachine()

        XCTAssertEqual(machine.nextReconnectDelay(), 1.0)
        XCTAssertEqual(machine.nextReconnectDelay(), 2.0)

        for _ in 0..<5 {
            _ = machine.nextReconnectDelay()
        }

        XCTAssertEqual(machine.reconnectDelay, 30.0)
    }

    func testDiscoveredHostIdIsStableAcrossRefreshes() {
        let first = DiscoveredHost(name: "Alphonso", host: "alphonso.local", port: 8765)
        let second = DiscoveredHost(name: "Alphonso", host: "alphonso.local", port: 8765)

        XCTAssertEqual(first.id, second.id)
    }

    func testManualPairingEndpointRejectsAnInvalidPortInsteadOfFallingBack() {
        XCTAssertNil(PairingEndpoint(host: "192.168.1.100", portText: "not-a-port"))
        XCTAssertNil(PairingEndpoint(host: "", portText: "8765"))
        XCTAssertEqual(PairingEndpoint(host: "192.168.1.100", portText: "8765"), PairingEndpoint(host: "192.168.1.100", portText: "8765"))
    }

    func testPairingPinKeepsOnlyTheFirstSixDigits() {
        XCTAssertEqual(PairingInput.pin(from: "12a34-5678"), "123456")
    }
}
