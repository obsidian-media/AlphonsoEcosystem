#[expect(dead_code)]
pub(crate) fn build_http_client(timeout_ms: u64) -> Result<reqwest::Client, String> {
