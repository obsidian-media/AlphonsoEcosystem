#[tauri::command]
pub(crate) fn send_app_notification(
  app: tauri::AppHandle,
  title: String,
  body: String,
) -> Result<(), String> {
  use tauri_plugin_notification::NotificationExt;
  app
    .notification()
    .builder()
    .title(&title)
    .body(&body)
    .show()
    .map_err(|e| e.to_string())
}
