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
        XCTAssertTrue(app.staticTexts["SEARCH ACCOUNTABILITY RECORDS"].exists)
        XCTAssertTrue(app.textFields["atlas.audit.search"].waitForExistence(timeout: 3))
    }

    func testHomeCreateWorkOpensStructuredPreparation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        let createWork = app.buttons["atlas.home.createWork"]
        XCTAssertTrue(createWork.waitForExistence(timeout: 3))
        createWork.tap()

        let brief = app.textFields["atlas.create.brief"]
        XCTAssertTrue(brief.waitForExistence(timeout: 3))
        XCTAssertEqual(brief.label, "Brief")

        let outcome = app.textFields["atlas.create.outcome"]
        XCTAssertTrue(outcome.exists)
        XCTAssertEqual(outcome.label, "Desired outcome")

        let prepare = app.buttons["atlas.create.prepare"]
        XCTAssertTrue(prepare.exists)
        XCTAssertFalse(prepare.isEnabled)
    }

    func testWorkSearchFiltersLoadedOutcomeRecords() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Work"].tap()
        XCTAssertTrue(app.staticTexts["SEARCH CURRENT WORK"].waitForExistence(timeout: 3))
        let segment = app.segmentedControls["atlas.work.segment"]
        XCTAssertTrue(segment.waitForExistence(timeout: 3))
        segment.buttons["Library"].tap()

        let search = app.textFields["atlas.work.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("OUT/RA-009")
        XCTAssertTrue(app.buttons["atlas.work.outcome.outcome-research-archive"].waitForExistence(timeout: 3))
        let clear = app.buttons["atlas.work.search.clear"]
        XCTAssertTrue(clear.waitForExistence(timeout: 3))
        clear.tap()
        XCTAssertFalse(clear.exists)
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

    func testInboxSearchFiltersLoadedDecisionRecords() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Inbox"].tap()
        XCTAssertTrue(app.staticTexts["SEARCH CURRENT DECISIONS"].waitForExistence(timeout: 3))
        let search = app.textFields["atlas.inbox.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("P-006")
        XCTAssertTrue(app.buttons["atlas.inbox.decision.decision-research-archive"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["atlas.inbox.decision.decision-release-brief"].exists)

        search.typeText(" unmatched")
        XCTAssertTrue(app.staticTexts["No matching Inbox records"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["Needs your judgement"].exists)
        XCTAssertFalse(app.staticTexts["Recorded"].exists)

        let clear = app.buttons["atlas.inbox.search.clear"]
        XCTAssertTrue(clear.waitForExistence(timeout: 3))
        clear.tap()
        XCTAssertTrue(app.buttons["atlas.inbox.decision.decision-research-archive"].waitForExistence(timeout: 3))
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

    func testInboxOpensReviewAndChallengeReadyRoutes() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Inbox"].tap()
        let review = app.buttons["atlas.inbox.decision.decision-release-brief"]
        XCTAssertTrue(review.waitForExistence(timeout: 3))
        review.tap()
        XCTAssertTrue(app.staticTexts["Decision review"].waitForExistence(timeout: 3))
        app.buttons["Close"].tap()

        let challengeReady = app.buttons["atlas.inbox.decision.decision-partner-brief"]
        XCTAssertTrue(challengeReady.waitForExistence(timeout: 3))
        challengeReady.tap()
        XCTAssertTrue(app.buttons["Request a new confirmation challenge"].waitForExistence(timeout: 3))
        app.buttons["Close"].tap()

        let recorded = app.buttons["atlas.inbox.decision.decision-research-archive"]
        XCTAssertTrue(recorded.waitForExistence(timeout: 3))
        recorded.tap()
        XCTAssertTrue(app.staticTexts["Intent recorded — not executed"].waitForExistence(timeout: 3))
    }

    func testTypedDirectionOpensPrefilledWorkPreparation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        app.tabBars.buttons["Chat"].tap()
        let direction = app.textFields["atlas.chat.direction"]
        XCTAssertTrue(direction.waitForExistence(timeout: 3))
        XCTAssertEqual(direction.label, "Typed direction for a work brief")

        let prepare = app.buttons["atlas.chat.prepare"]
        XCTAssertFalse(prepare.isEnabled)

        direction.tap()
        direction.typeText("Prepare a mobile release checklist")
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
