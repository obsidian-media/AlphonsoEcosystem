import Foundation

struct CompanionConnectionStateMachine: Equatable {
    private(set) var connectionState: ConnectionState = .disconnected
    private(set) var shouldReconnect = false
    private(set) var reconnectDelay: TimeInterval = 1.0

    mutating func startConnecting() {
        shouldReconnect = true
        connectionState = .connecting
        reconnectDelay = 1.0
    }

    mutating func beginReconnectAttempt() {
        shouldReconnect = true
        connectionState = .connecting
    }

    mutating func markAuthenticated() {
        connectionState = .authenticated
        reconnectDelay = 1.0
    }

    mutating func markTransportFailure() {
        if shouldReconnect {
            connectionState = .failed
        }
    }

    mutating func markInvalidPin() {
        shouldReconnect = false
        connectionState = .disconnected
        reconnectDelay = 1.0
    }

    mutating func disconnectManually() {
        shouldReconnect = false
        connectionState = .disconnected
        reconnectDelay = 1.0
    }

    mutating func nextReconnectDelay() -> TimeInterval {
        defer { reconnectDelay = min(reconnectDelay * 2, 30.0) }
        return reconnectDelay
    }
}
