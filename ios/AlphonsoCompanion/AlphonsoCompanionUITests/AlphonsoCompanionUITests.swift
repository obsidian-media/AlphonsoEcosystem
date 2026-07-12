import XCTest

final class AlphonsoCompanionUITests: XCTestCase {
    func testLaunchShowsPrimaryTabs() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Connect"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Agents"].exists)
        XCTAssertTrue(app.tabBars.buttons["Voice"].exists)
        XCTAssertTrue(app.textFields["pairing-pin-field"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["pairing-connect-button"].waitForExistence(timeout: 5))

        app.tabBars.buttons["Voice"].tap()
        XCTAssertTrue(app.navigationBars["Voice"].waitForExistence(timeout: 2))

        app.tabBars.buttons["Agents"].tap()
        XCTAssertTrue(app.navigationBars["Agents"].waitForExistence(timeout: 2))
    }
}
