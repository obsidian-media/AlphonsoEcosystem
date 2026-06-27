import Network
import Foundation

@MainActor
class MDNSService: ObservableObject {
    @Published var discovered: [DiscoveredHost] = []
    private var browser: NWBrowser?
    private var connection: NWConnection?

    func startBrowsing() {
        let descriptor = NWBrowser.Descriptor.bonjour(
            serviceType: "_alphonso",
            domain: "local"
        )
        let parameters = NWParameters.tcp
        browser = NWBrowser(for: descriptor, using: parameters)

        browser?.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                self?.discovered = results.compactMap { result in
                    guard case .service(let name, _, _, _) = result.endpoint else {
                        return nil
                    }
                    // For service endpoints, we get the service name
                    // The actual host/port will be resolved when connecting
                    return DiscoveredHost(
                        name: name,
                        host: "",
                        port: 8765
                    )
                }
            }
        }

        browser?.stateUpdateHandler = { newState in
            switch newState {
            case .ready:
                break
            case .failed(let error):
                break
            default:
                break
            }
        }

        browser?.start(queue: .main)
    }

    func stopBrowsing() {
        browser?.cancel()
        browser = nil
    }

    func resolveHost(_ host: DiscoveredHost) -> (String, UInt16)? {
        return (host.host, host.port)
    }
}