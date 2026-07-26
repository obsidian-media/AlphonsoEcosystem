use mdns_sd::{ServiceDaemon, ServiceInfo};

pub struct CompanionDiscovery {
  daemon: ServiceDaemon,
}

impl CompanionDiscovery {
  pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
    let daemon = ServiceDaemon::new()?;
    Ok(Self { daemon })
  }

  pub fn advertise(&self, port: u16, hostname: &str) -> Result<(), Box<dyn std::error::Error>> {
    let service_type = "_alphonso._tcp.local.";
    let instance_name = format!("Alphonso-{}", hostname);
    let ip = local_ip().unwrap_or("0.0.0.0".to_string());
    let mdns_host_name = to_mdns_host_name(hostname);

    let service_info = ServiceInfo::new(
      service_type,
      &instance_name,
      &mdns_host_name,
      ip.as_str(),
      port,
      None,
    )?;

    self.daemon.register(service_info)?;
    Ok(())
  }

  #[allow(dead_code)]
  pub fn stop(&self) {
    let _ = self.daemon.shutdown();
  }
}

/// Resolves the local (outbound-facing) IPv4 address by connecting a UDP
/// socket to 8.8.8.8 (Google Public DNS). This is a well-known cross-platform
/// technique — the socket never actually sends data; it only asks the kernel
/// which interface would be used to reach that IP.
///
/// Dependencies:
///   - External: 8.8.8.8 (Google DNS). If that host is unreachable (air-gapped
///     network, no default route), the connect will fail and we fall back to
///     "0.0.0.0" which prevents mDNS advertisement from working correctly.
///     In an air-gapped setup, mDNS-based companion discovery is inherently
///     limited to link-local; add a manual-IP fallback in the UI if needed.
#[allow(dead_code)]
fn local_ip() -> Option<String> {
  use std::net::{IpAddr, UdpSocket};
  let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
  if socket.connect("8.8.8.8:80").is_err() {
    // Fallback: bind a TCP listener and inspect the local address without
    // connecting to an external host. Works on all platforms and handles
    // air-gapped / no-default-route scenarios gracefully.
    drop(socket);
    let local = UdpSocket::bind("0.0.0.0:0").ok()?;
    local.connect("127.0.0.1:0").ok()?;
    if let Ok(addr) = local.local_addr() {
      if let IpAddr::V4(ip) = addr.ip() {
        if !ip.is_loopback() {
          return Some(ip.to_string());
        }
      }
    }
    return None;
  }
  match socket.local_addr().ok()?.ip() {
    IpAddr::V4(ip) => Some(ip.to_string()),
    _ => None,
  }
}

/// mdns-sd's `ServiceInfo::new` does NOT append ".local." to the host name —
/// it only dedupes an already-doubled ".local.local." suffix (see
/// `normalize_hostname` in the mdns-sd crate). Passing a bare OS hostname
/// (e.g. "DESKTOP-ABC123") registers a service whose SRV target is not a
/// resolvable mDNS host record, so Bonjour clients (including iOS's
/// `NWBrowser`/`NWConnection`) can discover the service but fail to resolve
/// it to a connectable address — this was the root cause of iOS companion
/// pairing failing to find the desktop.
fn to_mdns_host_name(hostname: &str) -> String {
  let sanitized = hostname.trim_end_matches('.').replace(' ', "-");
  if sanitized.ends_with(".local") {
    format!("{sanitized}.")
  } else {
    format!("{sanitized}.local.")
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn to_mdns_host_name_appends_local_suffix() {
    assert_eq!(to_mdns_host_name("DESKTOP-ABC123"), "DESKTOP-ABC123.local.");
  }

  #[test]
  fn to_mdns_host_name_replaces_spaces() {
    assert_eq!(to_mdns_host_name("My Desktop"), "My-Desktop.local.");
  }

  #[test]
  fn to_mdns_host_name_does_not_double_suffix() {
    assert_eq!(to_mdns_host_name("host.local"), "host.local.");
    assert_eq!(to_mdns_host_name("host.local."), "host.local.");
  }
}
