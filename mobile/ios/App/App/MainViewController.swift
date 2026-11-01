import Capacitor

/// Capacitor's view controller, with this app's own plugin registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AlphonsoPhonePlugin())
    }
}
