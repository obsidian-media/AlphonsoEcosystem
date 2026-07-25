import XCTest
import Network
@testable import AlphonsoCompanion

/// Regression coverage for `MDNSService.sanitizedHostString(from:)`.
///
/// Note: the zone-id-stripping branch (`.ipv6` host with a `%<interface>` suffix) requires a
/// live `NWInterface`, which cannot be constructed in a unit test — that branch is exercised
/// only by the runtime `print` diagnostics added alongside this fix, not by this suite. The
/// cases below cover everything that can be constructed deterministically.
final class MDNSServiceHostTests: XCTestCase {
    func testIPv4HostReturnsDottedString() {
        let address = IPv4Address("192.168.1.42")!
        XCTAssertEqual(MDNSService.sanitizedHostString(from: .ipv4(address)), "192.168.1.42")
    }

    func testIPv6HostWithoutZoneIsUnchanged() {
        let address = IPv6Address("fe80::1")!
        XCTAssertEqual(MDNSService.sanitizedHostString(from: .ipv6(address)), "fe80::1")
    }

    func testNameHostReturnsNameOnly() {
        XCTAssertEqual(MDNSService.sanitizedHostString(from: .name("desktop-abc123.local", nil)), "desktop-abc123.local")
    }
}
