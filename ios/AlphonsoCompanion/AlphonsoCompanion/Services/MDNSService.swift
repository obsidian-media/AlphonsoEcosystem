import Network
import Foundation

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
                    host: name,
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
    
    func resolveHost(_ host: DiscoveredHost, completion: @escaping (String, UInt16) -> Void) {
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
                    if case .hostPort(let host, let port) = connection.currentPath?.remoteEndpoint {
                        let hostname = "\(host)"
                        let portValue = UInt16(port.rawValue)
                        completion(hostname, portValue)
                    } else {
                        // Fallback to service name
                        completion(host.name, 8765)
                    }
                    connection.cancel()
                case .failed:
                    // Fallback
                    completion(host.name, 8765)
                    connection.cancel()
                default:
                    break
                }
            }
        }
        
        connection.start(queue: .main)
    }
}
