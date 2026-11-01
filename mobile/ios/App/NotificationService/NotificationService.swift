// Opens a notice the computer sealed for this phone (src/services/phone/phoneLink.ts's
// pushNotice: crypto_box, nonce first, base64url) and shows its real text. Apple, Google and
// the relay only ever see "New activity". A step that spends, sends or publishes, or deletes
// comes with only Open (the computer decides which buttons a notice gets).
import Sodium
import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    private var handler: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        handler = contentHandler
        let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        self.content = content
        if let sealed = request.content.userInfo["sealed"] as? String, let notice = Notice.open(sealed) {
            content.title = notice.title
            content.body = notice.body
            content.categoryIdentifier = notice.actions.contains("approve") ? "alphonso_approve" : "alphonso_open"
            var info = content.userInfo
            info.removeValue(forKey: "sealed")
            info["requestId"] = notice.requestId
            info["stepId"] = notice.stepId ?? ""
            content.userInfo = info
        }
        contentHandler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler = handler, let content = content { handler(content) }
    }
}

struct Notice {
    let title: String
    let body: String
    let requestId: String
    let stepId: String?
    let actions: [String]

    private static func bytes(_ s: String) -> Bytes? {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        guard let d = Data(base64Encoded: t) else { return nil }
        return Bytes(d)
    }

    static func open(_ sealed: String) -> Notice? {
        guard let mine = PhoneKeychain.get(PhoneKeychain.privateKeyName).flatMap(bytes),
              let theirs = PhoneKeychain.get(PhoneKeychain.computerKeyName).flatMap(bytes),
              let raw = bytes(sealed),
              let opened = Sodium().box.open(nonceAndAuthenticatedCipherText: raw, senderPublicKey: theirs, recipientSecretKey: mine),
              let message = try? JSONSerialization.jsonObject(with: Data(opened)) as? [String: Any],
              message["kind"] as? String == "notice",
              let n = message["notification"] as? [String: Any],
              let title = n["title"] as? String, let body = n["body"] as? String,
              let requestId = n["requestId"] as? String
        else { return nil }
        return Notice(title: title, body: body, requestId: requestId, stepId: n["stepId"] as? String, actions: n["actions"] as? [String] ?? ["open"])
    }
}
