// The phone app's own native parts for the shared screens (mobile/src/native.ts): secure
// storage, Face ID / Touch ID / passcode, notification permission and the Firebase push
// token, and the buttons on Alphonso's notifications. Capacitor's notification router owns
// the notification delegate, so the buttons arrive here as its push handler.
import Capacitor
import FirebaseMessaging
import LocalAuthentication
import UserNotifications

enum PhoneNotificationCategory {
    static let approve = "alphonso_approve"
    static let open = "alphonso_open"

    /// Approve and Reject open the app, which answers the computer through its link.
    static func register() {
        let approve = UNNotificationAction(identifier: "approve", title: "Approve", options: [.foreground])
        let reject = UNNotificationAction(identifier: "reject", title: "Reject", options: [.foreground, .destructive])
        let open = UNNotificationAction(identifier: "open", title: "Open", options: [.foreground])
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: Self.approve, actions: [approve, reject], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: Self.open, actions: [open], intentIdentifiers: [], options: []),
        ])
    }
}

@objc(AlphonsoPhonePlugin)
public class AlphonsoPhonePlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "AlphonsoPhonePlugin"
    public let jsName = "AlphonsoPhone"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingActions", returnType: CAPPluginReturnPromise),
    ]
    private var pending: [[String: String]] = []

    public override func load() {
        bridge?.notificationRouter.pushNotificationHandler = self
        PhoneNotificationCategory.register()
    }

    @objc func getSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { call.reject("No key."); return }
        if let value = PhoneKeychain.get(key) { call.resolve(["value": value]) } else { call.resolve(["value": NSNull()]) }
    }

    @objc func setSecret(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else { call.reject("No key."); return }
        if PhoneKeychain.set(key, value) { call.resolve() } else { call.reject("The phone's secure storage refused it.") }
    }

    /// Face ID / Touch ID, else the passcode. A phone with no passcode may open the app, but a
    /// strict confirmation (approving a step that spends, sends or deletes) is refused.
    @objc func confirm(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Confirm"
        let strict = call.getBool("strict") ?? false
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            let noPasscode = (error as? LAError)?.code == .passcodeNotSet
            call.resolve(["ok": noPasscode && !strict])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
            call.resolve(["ok": ok])
        }
    }

    @objc func requestNotifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
            call.resolve(["granted": granted])
        }
    }

    /// The Firebase token, once the APNs token has arrived (AppDelegate hands it over).
    @objc func pushToken(_ call: CAPPluginCall) {
        Messaging.messaging().token { token, _ in
            if let token = token { call.resolve(["token": token]) } else { call.resolve(["token": NSNull()]) }
        }
    }

    @objc func takePendingActions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let actions = self.pending
            self.pending = []
            call.resolve(["actions": actions])
        }
    }

    // MARK: NotificationHandlerProtocol (from Capacitor's router)

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        let info = response.notification.request.content.userInfo
        guard let requestId = info["requestId"] as? String, !requestId.isEmpty else { return }
        let id = response.actionIdentifier
        var action: [String: String] = [
            "action": id == "approve" || id == "reject" ? id : "open",
            "requestId": requestId,
        ]
        if let stepId = info["stepId"] as? String, !stepId.isEmpty { action["stepId"] = stepId }
        DispatchQueue.main.async {
            if self.hasListeners("notificationAction") {
                self.notifyListeners("notificationAction", data: action)
            } else {
                self.pending.append(action)
            }
        }
    }
}
