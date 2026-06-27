use rand::Rng;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct PinManager {
  current_pin: Mutex<Option<(String, Instant)>>,
  ttl: Duration,
}

impl PinManager {
  pub fn new(ttl_secs: u64) -> Self {
    Self {
      current_pin: Mutex::new(None),
      ttl: Duration::from_secs(ttl_secs),
    }
  }

  pub async fn generate(&self) -> String {
    let pin: String = format!("{:06}", rand::rng().random_range(0..1_000_000));
    *self.current_pin.lock().await = Some((pin.clone(), Instant::now()));
    pin
  }

  pub async fn verify(&self, attempt: &str) -> bool {
    let guard = self.current_pin.lock().await;
    match &*guard {
      Some((pin, created_at)) => {
        if created_at.elapsed() > self.ttl {
          return false;
        }
        pin == attempt
      }
      None => false,
    }
  }

  pub async fn invalidate(&self) {
    *self.current_pin.lock().await = None;
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_pin_generate_and_verify() {
    let mgr = PinManager::new(300);
    let pin = mgr.generate().await;
    assert_eq!(pin.len(), 6);
    assert!(mgr.verify(&pin).await);
    assert!(!mgr.verify("000000").await);
  }

  #[tokio::test]
  async fn test_pin_invalidated_after_use() {
    let mgr = PinManager::new(300);
    let pin = mgr.generate().await;
    mgr.invalidate().await;
    assert!(!mgr.verify(&pin).await);
  }

  #[tokio::test]
  async fn test_pin_expired() {
    let mgr = PinManager::new(0);
    let pin = mgr.generate().await;
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    assert!(!mgr.verify(&pin).await);
  }
}
