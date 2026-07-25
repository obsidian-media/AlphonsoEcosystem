import Network
import Foundation

enum MDNSResolutionError: LocalizedError {
    case endpointUnavailable
    case failed(Error)

    var errorDescription: String? {
        switch self {
        case .endpointUnavailable:
            return "The discovered desktop did not provide a reachable network endpoint."
        case .failed(let error):
            return error.localizedDescription
        }
    }
}

@MainActor
class MDNSService: ObservableObject {
    @Published var discovered: [DiscoveredHost] = []
    private var browser: NWBrowser?
    private var connection: NWConnection?

    func startBrowsing() {
        let descriptor = NWBrowser.Descriptor.bonjour(
            type: "_alphonso._tcp",
            domain: "local"
        )
        let parameters = NWParameters.tcp
        browser = NWBrowser(for: descriptor, using: parameters)

        browser?.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self = self else { return }
            let discovered = results.compactMap { result -> DiscoveredHost? in
                guard case .service(let name, _, _, _) = result.endpoint else {
                    return nil
                }
                return DiscoveredHost(
                    name: name,
                    host: "\(name).local",
                    port: 8765
                )
            }
            Task { @MainActor [weak self] in
                self?.discovered = discovered
            }
        }

        browser?.stateUpdateHandler = { [weak self] newState in
            Task { @MainActor [weak self] in
                switch newState {
                case .ready:
                    break
                case .failed(let error):
                    self?.discovered = []
                    print("[MDNSService] Browse failed: \(error)")
                case .cancelled:
                    break
                default:
                    break
                }
            }
        }

        browser?.start(queue: .main)
    }

    func stopBrowsing() {
        browser?.cancel()
        browser = nil
    }
    
    func resolveHost(_ host: DiscoveredHost, completion: @escaping (Result<(host: String, port: UInt16), MDNSResolutionError>) -> Void) {
        // For Bonjour services, we connect using the service name
        // NWConnection will resolve the endpoint automatically
        let endpoint = NWEndpoint.service(
            name: host.name,
            type: "_alphonso._tcp",
            domain: "local",
            interface: nil
        )
        
        let connection = NWConnection(to: endpoint, using: .tcp)
        self.connection = connection
        
        connection.stateUpdateHandler = { state in
            Task { @MainActor in
                switch state {
                case .ready:
                    // Once connected, we can get the actual endpoint
                    if case .hostPort(let resolvedHost, let port) = connection.currentPath?.remoteEndpoint {
                        let hostname = Self.sanitizedHostString(from: resolvedHost)
                        let portValue = UInt16(port.rawValue)
                        print("[MDNSService] Resolved \(host.name) -> raw=\(resolvedHost) sanitized=\(hostname) port=\(portValue)")
                        completion(.success((hostname, portValue)))
                    } else {
                        print("[MDNSService] No remote endpoint on ready connection for \(host.name)")
                        completion(.failure(.endpointUnavailable))
                    }
                    connection.cancel()
                case .failed(let error):
                    print("[MDNSService] Resolution connection failed for \(host.name): \(error)")
                    completion(.failure(.failed(error)))
                    connection.cancel()
                default:
                    break
                }
            }
        }

        connection.start(queue: .main)
    }

    /// Converts a resolved `NWEndpoint.Host` into a string safe to hand to `URLComponents.host`.
    ///
    /// `"\(host)"` on an `.ipv6` case can include a zone/scope id (e.g. `fe80::1%en0`) appended
    /// by the system when the address is only reachable via a specific interface. The `%`
    /// character is not valid in a URI host component (RFC 3986 / RFC 6874 requires it to be
    /// percent-encoded as `%25<zone>`), so passing it straight through makes
    /// `URLComponents.url` return `nil` — which is the "Could not form websocket URL" failure.
    /// Stripping the zone id here keeps IPv6 hosts usable for standard URL construction; the
    /// (rare, link-local-address) tradeoff is documented in the deferred-work register.
    /// Internal (not private) so `AlphonsoCompanionTests` can exercise it via `@testable import`.
    static func sanitizedHostString(from host: NWEndpoint.Host) -> String {
        switch host {
        case .ipv4(let address):
            return "\(address)"
        case .ipv6(let address):
            let raw = "\(address)"
            if let zoneSeparator = raw.firstIndex(of: "%") {
                return String(raw[..<zoneSeparator])
            }
            return raw
        case .name(let name, _):
            return name
        @unknown default:
            return "\(host)"
        }
    }
}
