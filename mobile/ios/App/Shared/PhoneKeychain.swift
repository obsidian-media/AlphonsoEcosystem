// Secure storage shared by the app and its notification extension (one keychain group, set
// in each target's Info.plist as AlphonsoKeychainGroup). The key names match
// src/mobile/phoneSession.ts (PRIVATE_KEY_NAME, COMPUTER_KEY_NAME); a test checks them.
import Foundation
import Security

enum PhoneKeychain {
    static let service = "alphonso.phone"
    static let privateKeyName = "alphonso_phone_private_key"
    static let computerKeyName = "alphonso_phone_computer_key"

    /// The shared group; nil when the build has no team prefix (an unsigned simulator build).
    static var group: String? {
        guard let g = Bundle.main.object(forInfoDictionaryKey: "AlphonsoKeychainGroup") as? String,
              !g.isEmpty, !g.hasPrefix("$("), !g.hasPrefix(".") else { return nil }
        return g
    }

    private static func query(_ key: String, group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        if let g = group { q[kSecAttrAccessGroup as String] = g }
        return q
    }

    static func get(_ key: String) -> String? {
        for g in [group, nil] {
            var q = query(key, group: g)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: AnyObject?
            if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data {
                return String(data: d, encoding: .utf8)
            }
        }
        return nil
    }

    /// Saved readable after the first unlock, on this device only: the extension opens
    /// notices while the phone is locked.
    @discardableResult
    static func set(_ key: String, _ value: String) -> Bool {
        for g in [group, nil] {
            let q = query(key, group: g)
            SecItemDelete(q as CFDictionary)
            var add = q
            add[kSecValueData as String] = Data(value.utf8)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(add as CFDictionary, nil)
            if status == errSecSuccess { return true }
            // Only an unsigned build (no keychain entitlement) falls back to the app's own keychain.
            if status != errSecMissingEntitlement { return false }
        }
        return false
    }
}
