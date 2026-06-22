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

    let service_info = ServiceInfo::new(
      service_type,
      &instance_name,
      hostname,
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

#[allow(dead_code)]
fn local_ip() -> Option<String> {
  use std::net::{IpAddr, UdpSocket};
  let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
  socket.connect("8.8.8.8:80").ok()?;
  match socket.local_addr().ok()?.ip() {
    IpAddr::V4(ip) => Some(ip.to_string()),
    _ => None,
  }
}
