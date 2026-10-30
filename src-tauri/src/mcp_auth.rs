//! Signing in to outside MCP servers. Filled in by the sign-in task; until then a refused
//! token is never refreshed.

/// Refreshes a server's saved sign-in. `Ok(true)` when a new token was saved.
pub(crate) async fn refresh_saved_token(_server_id: &str) -> Result<bool, String> {
  Ok(false)
}
