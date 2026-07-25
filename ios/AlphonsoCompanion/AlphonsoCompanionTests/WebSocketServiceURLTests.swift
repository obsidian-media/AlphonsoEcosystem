import XCTest
@testable import AlphonsoCompanion

/// Regression coverage for the "Could not form websocket URL" companion-pairing failure.
/// Root cause: `URLComponents.host` returns `nil` from `.url` when handed a bare IPv6
/// literal (needs `[...]` brackets) or a host string containing a raw `%` zone id.
final class WebSocketServiceURLTests: XCTestCase {
    func testIPv4HostProducesValidURL() {
        let url = WebSocketService.makeWebSocketURL(host: "192.168.1.42", port: 8765)
        XCTAssertEqual(url?.absoluteString, "ws://192.168.1.42:8765")
    }

    func testHostnameProducesValidURL() {
        let url = WebSocketService.makeWebSocketURL(host: "desktop-abc123.local", port: 8765)
        XCTAssertEqual(url?.absoluteString, "ws://desktop-abc123.local:8765")
    }

    func testBareIPv6LiteralIsBracketed() {
        let url = WebSocketService.makeWebSocketURL(host: "fe80::1", port: 8765)
        XCTAssertEqual(url?.absoluteString, "ws://[fe80::1]:8765")
    }

    func testAlreadyBracketedIPv6LiteralIsNotDoubleBracketed() {
        let url = WebSocketService.makeWebSocketURL(host: "[fe80::1]", port: 8765)
        XCTAssertEqual(url?.absoluteString, "ws://[fe80::1]:8765")
    }

    func testEmptyHostFailsToConstructURL() {
        let url = WebSocketService.makeWebSocketURL(host: "", port: 8765)
        XCTAssertNil(url)
    }
}
