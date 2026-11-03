fn main() {
  // The phone relay address is built into the backend (phone_relay.rs).
  println!("cargo:rerun-if-env-changed=VITE_PHONE_RELAY_URL");
  tauri_build::build()
}
