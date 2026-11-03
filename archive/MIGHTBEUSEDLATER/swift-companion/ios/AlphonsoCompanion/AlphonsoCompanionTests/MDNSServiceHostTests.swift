import XCTest
import Network
@testable import AlphonsoCompanion

/// Regression coverage for `MDNSService.sanitizedHostString(from:)` and
/// `MDNSService.stripInterfaceSuffix(_:)`.
///
/// Note: exercising `sanitizedHostString` with an actual scoped `NWEndpoint.Host` (the real
/// device failure was `.ipv4` with a `%en0` suffix, e.g. "10.0.0.17%en0") requires a live
/// `NWInterface`, which cannot be constructed in a unit test. `stripInterfaceSuffix` was split
/// out specifically so the string-manipulation logic itself — the part that actually broke — has
/// real, direct test coverage independent of that constraint.
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

    func testStripInterfaceSuffixRemovesIPv4ScopeId() {
        // The exact real-device failure: "Could not build ws:// URL for host=\"10.0.0.17%en0\""
        XCTAssertEqual(MDNSService.stripInterfaceSuffix("10.0.0.17%en0"), "10.0.0.17")
    }

    func testStripInterfaceSuffixRemovesIPv6ScopeId() {
        XCTAssertEqual(MDNSService.stripInterfaceSuffix("fe80::1%en0"), "fe80::1")
    }

    func testStripInterfaceSuffixLeavesUnscopedStringUnchanged() {
        XCTAssertEqual(MDNSService.stripInterfaceSuffix("10.0.0.17"), "10.0.0.17")
    }
}
