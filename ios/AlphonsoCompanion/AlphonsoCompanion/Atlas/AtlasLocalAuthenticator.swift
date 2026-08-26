import Foundation
import LocalAuthentication

enum AtlasLocalAuthenticationError: LocalizedError, Equatable {
    case unavailable
    case failed

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Face ID or Touch ID is not available for this Atlas confirmation."
        case .failed:
            return "Device authentication was not completed. No Atlas confirmation was recorded."
        }
    }
}

struct AtlasLocalAuthenticator {
    func authenticate(reason: String) async throws {
        let context = LAContext()
        var policyError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &policyError) else {
            throw AtlasLocalAuthenticationError.unavailable
        }
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
            guard success else { throw AtlasLocalAuthenticationError.failed }
        } catch {
            throw AtlasLocalAuthenticationError.failed
        }
    }
}
