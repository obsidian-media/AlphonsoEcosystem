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
        constant_time_eq(pin.as_bytes(), attempt.as_bytes())
      }
      None => false,
    }
  }

  pub async fn invalidate(&self) {
    *self.current_pin.lock().await = None;
  }
}

/// Length-checked constant-time byte comparison. The PIN length is not secret
/// (always 6 digits), so an early length mismatch is fine; the byte loop avoids
/// leaking *which* digit differs via short-circuit timing.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
  if a.len() != b.len() {
    return false;
  }
  let mut diff: u8 = 0;
  for (x, y) in a.iter().zip(b.iter()) {
    diff |= x ^ y;
  }
  diff == 0
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

  #[test]
  fn test_constant_time_eq() {
    assert!(constant_time_eq(b"123456", b"123456"));
    assert!(!constant_time_eq(b"123456", b"123457"));
    assert!(!constant_time_eq(b"123456", b"12345")); // length mismatch
    assert!(!constant_time_eq(b"", b"1"));
    assert!(constant_time_eq(b"", b""));
  }
}
