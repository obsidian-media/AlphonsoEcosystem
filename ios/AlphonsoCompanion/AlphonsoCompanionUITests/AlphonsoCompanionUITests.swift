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
        XCTAssertTrue(app.descendants(matching: .any)["atlas.home.workspaceHealth"].exists)
    }

    func testAtlasMoreRoutesExposeAccountAndAuditSurfaces() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["More"].tap()
        let account = app.buttons["atlas.more.account"]
        XCTAssertTrue(account.waitForExistence(timeout: 3))
        account.tap()
        XCTAssertTrue(app.staticTexts["Account & Cloud"].waitForExistence(timeout: 3))
        app.buttons["Close"].tap()

        let audit = app.buttons["atlas.more.auditTrail"]
        XCTAssertTrue(audit.waitForExistence(timeout: 3))
        audit.tap()
        XCTAssertTrue(app.staticTexts["Audit trail"].waitForExistence(timeout: 3))
    }

    func testHomeCreateWorkOpensStructuredPreparation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        let createWork = app.buttons["atlas.home.createWork"]
        XCTAssertTrue(createWork.waitForExistence(timeout: 3))
        createWork.tap()

        XCTAssertTrue(app.descendants(matching: .any)["atlas.create.brief"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["atlas.create.outcome"].exists)
        XCTAssertTrue(app.buttons["atlas.create.prepare"].exists)
    }

    func testInboxGroupsReviewChallengeAndRecordedDecisions() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Inbox"].tap()
        XCTAssertTrue(app.staticTexts["Needs your judgement"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Confirmation queue"].exists)
        XCTAssertTrue(app.staticTexts["Recorded"].exists)
    }

    func testWorkLibraryOpensVerifiedOutcomeRecord() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Work"].tap()
        let segment = app.segmentedControls["atlas.work.segment"]
        XCTAssertTrue(segment.waitForExistence(timeout: 3))
        segment.buttons["Library"].tap()

        let outcome = app.buttons["atlas.work.outcome.outcome-research-archive"]
        XCTAssertTrue(outcome.waitForExistence(timeout: 3))
        outcome.tap()
        XCTAssertTrue(app.staticTexts["Outcome record"].waitForExistence(timeout: 3))
    }

    func testTypedDirectionOpensPrefilledWorkPreparation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Chat"].tap()
        let direction = app.descendants(matching: .any)["atlas.chat.direction"]
        XCTAssertTrue(direction.waitForExistence(timeout: 3))
        direction.tap()
        direction.typeText("Prepare a mobile release checklist")

        let prepare = app.buttons["atlas.chat.prepare"]
        XCTAssertTrue(prepare.isEnabled)
        prepare.tap()

        let brief = app.descendants(matching: .any)["atlas.create.brief"]
        XCTAssertTrue(brief.waitForExistence(timeout: 3))
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
