use crate::{now_ms, utils};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OcrCapabilityProof {
  available: bool,
  engine: String,
  message: String,
  checked_at_ms: u64,
  trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OcrAdapterProof {
  adapter: String,
  engine_path: String,
  image_path: Option<String>,
  started_at_ms: u64,
  finished_at_ms: u64,
  success: bool,
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
  trust: String,
  error: Option<String>,
}

#[tauri::command]
pub(crate) fn run_ocr_adapter(
  adapter: Option<String>,
  engine_path: String,
  image_path: Option<String>,
  extra_args: Option<Vec<String>>,
) -> Result<OcrAdapterProof, String> {
  let started = now_ms();
  let adapter = adapter.unwrap_or_else(|| "version_check".to_string());
  let engine = PathBuf::from(&engine_path);
  if !engine.exists() || !engine.is_file() {
    return Ok(OcrAdapterProof {
      adapter,
      engine_path,
      image_path,
      started_at_ms: started,
      finished_at_ms: now_ms(),
      success: false,
      exit_code: None,
      stdout: String::new(),
      stderr: String::new(),
      trust: "failed".to_string(),
      error: Some("OCR engine binary path is invalid.".to_string()),
    });
  }

  let mut args = vec![];
  match adapter.as_str() {
    "version_check" => {
      args.push("--version".to_string());
    }
    "tesseract_cli" => {
      let image = image_path
        .clone()
        .ok_or_else(|| "Image path is required for tesseract_cli adapter.".to_string())?;
      let image_file = PathBuf::from(&image);
      if !image_file.exists() || !image_file.is_file() {
        return Err("Image path does not exist.".to_string());
      }
      args.push(image);
      args.push("stdout".to_string());
      args.push("--dpi".to_string());
      args.push("70".to_string());
    }
    _ => {
      return Err(
        "Unsupported OCR adapter. Supported adapters: version_check, tesseract_cli.".to_string(),
      );
    }
  }

  if let Some(extra) = extra_args {
    // Allowlist tesseract CLI flags so extra_args cannot be abused to execute
    // arbitrary sub-commands or redirect output to attacker-controlled paths.
    // Only flags with a documented, benign effect on tesseract output are
    // permitted here. `engine_path` is separately validated (must be an
    // existing file) above; this covers the argument list only.
    const ALLOWED_FLAGS: &[&str] = &[
      "--psm",
      "--oem",
      "-l",
      "--tessdata-dir",
      "--dpi",
      "--user-words",
      "--user-patterns",
      "--loglevel",
    ];
    // Each ALLOWED_FLAG must be immediately followed by its value token.
    // Standalone values (e.g. "pdf") are rejected to prevent Tesseract from
    // interpreting them as config-file names or sub-commands.
    let mut iter = extra.iter().peekable();
    while let Some(arg) = iter.next() {
      if ALLOWED_FLAGS.contains(&arg.as_str()) {
        match iter.next() {
          Some(val) => {
            args.push(arg.clone());
            args.push(val.clone());
          }
          None => {
            return Err(format!(
              "OCR flag {arg:?} requires a value but none was provided."
            ));
          }
        }
      } else {
        return Err(format!(
          "Disallowed OCR argument: {arg:?}. Permitted flags: {}",
          ALLOWED_FLAGS.join(", ")
        ));
      }
    }
  }

  let mut ocr_cmd = Command::new(&engine_path);
  ocr_cmd.args(&args);
  utils::no_window(&mut ocr_cmd);
  let output = ocr_cmd.output().map_err(|error| error.to_string())?;
  let finished = now_ms();
  let success = output.status.success();

  Ok(OcrAdapterProof {
    adapter,
    engine_path,
    image_path,
    started_at_ms: started,
    finished_at_ms: finished,
    success,
    exit_code: output.status.code(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    trust: if success {
      "verified".to_string()
    } else {
      "failed".to_string()
    },
    error: None,
  })
}

#[tauri::command]
pub(crate) fn check_ocr_capability(engine_path: Option<String>) -> OcrCapabilityProof {
  let checked_at_ms = now_ms();
  if let Some(path) = engine_path {
    let path_buf = PathBuf::from(&path);
    if path_buf.exists() && path_buf.is_file() {
      return OcrCapabilityProof {
        available: true,
        engine: "custom".to_string(),
        message: format!("OCR engine binary detected at {path}"),
        checked_at_ms,
        trust: "verified".to_string(),
      };
    }

    return OcrCapabilityProof {
      available: false,
      engine: "custom".to_string(),
      message: format!("OCR engine path does not exist: {path}"),
      checked_at_ms,
      trust: "failed".to_string(),
    };
  }

  OcrCapabilityProof {
    available: false,
    engine: "unconfigured".to_string(),
    message: "OCR engine is not configured yet. Set an engine path explicitly.".to_string(),
    checked_at_ms,
    trust: "unverified".to_string(),
  }
}
