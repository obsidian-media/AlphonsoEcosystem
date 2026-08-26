import XCTest

final class AlphonsoCompanionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAtlasIsTheDefaultMobileExperience() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.tabBars.buttons["Home"].exists)
        XCTAssertTrue(app.tabBars.buttons["Work"].exists)
        XCTAssertTrue(app.tabBars.buttons["Inbox"].exists)
        XCTAssertTrue(app.tabBars.buttons["Chat"].exists)
        XCTAssertTrue(app.tabBars.buttons["More"].exists)
        XCTAssertTrue(app.staticTexts["Northstar Workspace"].exists)
    }

    func testUserCanEnterAndExitLegacyCompanionMode() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["More"].tap()
        let openLegacy = app.buttons["Open legacy companion"]
        XCTAssertTrue(openLegacy.waitForExistence(timeout: 3))
        openLegacy.tap()

        XCTAssertTrue(app.staticTexts["Legacy local companion"].waitForExistence(timeout: 3))
        let returnToAtlas = app.buttons["Return to Atlas"]
        XCTAssertTrue(returnToAtlas.exists)
        returnToAtlas.tap()

        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 3))
    }
}
