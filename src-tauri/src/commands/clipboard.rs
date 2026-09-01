use crate::now_ms;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardProof {
  action: String,
  content: String,
  performed_at_ms: u64,
  trust: String,
}

#[tauri::command]
pub(crate) fn read_clipboard() -> Result<ClipboardProof, String> {
  let content = arboard::Clipboard::new()
    .and_then(|mut cb| cb.get_text())
    .map_err(|e| e.to_string())?;
  Ok(ClipboardProof {
    action: "read".to_string(),
    content,
    performed_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn write_clipboard(_content: String) -> Result<ClipboardProof, String> {
  arboard::Clipboard::new()
    .and_then(|mut cb| cb.set_text(_content.clone()))
    .map_err(|e| e.to_string())?;
  Ok(ClipboardProof {
    action: "write".to_string(),
    content: _content.chars().take(100).collect(),
    performed_at_ms: now_ms(),
    trust: "verified".to_string(),
  })
}
