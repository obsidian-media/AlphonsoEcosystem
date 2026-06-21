use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Write};

#[derive(Serialize)]
pub(crate) struct AuditWriteProof {
    pub(crate) path: String,
    pub(crate) written_at_ms: u64,
    pub(crate) bytes: usize,
    pub(crate) prev_hash: Option<String>,
    pub(crate) chain_hash: String,
    pub(crate) trust: String,
}

#[derive(Serialize)]
pub(crate) struct AuditChainVerificationProof {
    pub(crate) path: String,
    pub(crate) total_entries: usize,
    pub(crate) verified_entries: usize,
    pub(crate) broken_index: Option<usize>,
    pub(crate) reason: Option<String>,
    pub(crate) checked_at_ms: u64,
    pub(crate) trust: String,
}

fn rand_suffix() -> String {
    format!("{:x}", crate::now_ms() % 0x00ff_ffff)
}

pub(crate) fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

pub(crate) fn append_plugin_audit_event(
    app: &tauri::AppHandle,
    event_type: &str,
    entry: Value,
) -> Result<(), String> {
    append_audit_log(app.clone(), event_type.to_string(), entry).map(|_| ())
}

#[tauri::command]
pub(crate) fn append_audit_log(
    app: tauri::AppHandle,
    event_type: String,
    entry: Value,
) -> Result<AuditWriteProof, String> {
    let dir = crate::app_data_subdir(&app, "audit")?;
    let mut file_path = dir.clone();
    file_path.push("verification.log.jsonl");

    let prev_hash = if file_path.exists() {
        let file = fs::File::open(&file_path).map_err(|error| error.to_string())?;
        let reader = BufReader::new(file);
        let mut last_hash: Option<String> = None;
        for line in reader.lines() {
            let line = line.map_err(|error| error.to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(parsed) = serde_json::from_str::<Value>(&line) {
                last_hash = parsed
                    .get("chain_hash")
                    .and_then(Value::as_str)
                    .map(str::to_string);
            }
        }
        last_hash
    } else {
        None
    };

    let written_at_ms = crate::now_ms();
    let entry_json = serde_json::to_string(&entry).map_err(|error| error.to_string())?;
    let chain_input = format!(
        "{}|{}|{}|{}",
        event_type,
        written_at_ms,
        entry_json,
        prev_hash.clone().unwrap_or_else(|| "GENESIS".to_string())
    );
    let chain_hash = sha256_hex(&chain_input);

    let mut payload = Map::new();
    payload.insert(
        "id".to_string(),
        Value::String(format!("audit-{}-{}", crate::now_ms(), rand_suffix())),
    );
    payload.insert(
        "timestamp_ms".to_string(),
        Value::Number(written_at_ms.into()),
    );
    payload.insert("event_type".to_string(), Value::String(event_type));
    payload.insert("entry".to_string(), entry);
    payload.insert(
        "prev_hash".to_string(),
        prev_hash.clone().map(Value::String).unwrap_or(Value::Null),
    );
    payload.insert("chain_hash".to_string(), Value::String(chain_hash.clone()));

    let encoded =
        serde_json::to_string(&Value::Object(payload)).map_err(|error| error.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|error| error.to_string())?;
    file.write_all(encoded.as_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;

    Ok(AuditWriteProof {
        path: file_path.to_string_lossy().to_string(),
        written_at_ms,
        bytes: encoded.len(),
        prev_hash,
        chain_hash,
        trust: "verified".to_string(),
    })
}

#[tauri::command]
pub(crate) fn read_audit_log(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<Vec<Value>, String> {
    let dir = crate::app_data_subdir(&app, "audit")?;
    let mut file_path = dir.clone();
    file_path.push("verification.log.jsonl");
    if !file_path.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&file_path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut entries: Vec<Value> = vec![];
    for line in reader.lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            entries.push(value);
        }
    }

    let take = limit.unwrap_or(200);
    if entries.len() > take {
        Ok(entries.split_off(entries.len() - take))
    } else {
        Ok(entries)
    }
}

#[tauri::command]
pub(crate) fn verify_audit_chain(
    app: tauri::AppHandle,
) -> Result<AuditChainVerificationProof, String> {
    let dir = crate::app_data_subdir(&app, "audit")?;
    let mut file_path = dir.clone();
    file_path.push("verification.log.jsonl");
    let checked_at_ms = crate::now_ms();

    if !file_path.exists() {
        return Ok(AuditChainVerificationProof {
            path: file_path.to_string_lossy().to_string(),
            total_entries: 0,
            verified_entries: 0,
            broken_index: None,
            reason: Some("Audit log file does not exist yet.".to_string()),
            checked_at_ms,
            trust: "unverified".to_string(),
        });
    }

    let file = fs::File::open(&file_path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut previous_hash: Option<String> = None;
    let mut total_entries = 0_usize;
    let mut verified_entries = 0_usize;

    for (index, line) in reader.lines().enumerate() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        total_entries += 1;

        let parsed = match serde_json::from_str::<Value>(&line) {
            Ok(value) => value,
            Err(error) => {
                return Ok(AuditChainVerificationProof {
                    path: file_path.to_string_lossy().to_string(),
                    total_entries,
                    verified_entries,
                    broken_index: Some(index),
                    reason: Some(format!("Invalid JSON line: {error}")),
                    checked_at_ms,
                    trust: "failed".to_string(),
                });
            }
        };

        let event_type = parsed
            .get("event_type")
            .and_then(Value::as_str)
            .unwrap_or("");
        let timestamp_ms = parsed
            .get("timestamp_ms")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let entry_value = parsed.get("entry").cloned().unwrap_or(Value::Null);
        let stored_prev = parsed
            .get("prev_hash")
            .and_then(Value::as_str)
            .map(str::to_string);
        let stored_hash = parsed
            .get("chain_hash")
            .and_then(Value::as_str)
            .map(str::to_string);

        if stored_hash.is_none() {
            return Ok(AuditChainVerificationProof {
                path: file_path.to_string_lossy().to_string(),
                total_entries,
                verified_entries,
                broken_index: Some(index),
                reason: Some("Missing chain_hash field.".to_string()),
                checked_at_ms,
                trust: "failed".to_string(),
            });
        }

        let expected_prev = previous_hash.clone();
        if stored_prev != expected_prev {
            return Ok(AuditChainVerificationProof {
                path: file_path.to_string_lossy().to_string(),
                total_entries,
                verified_entries,
                broken_index: Some(index),
                reason: Some("prev_hash does not match previous entry hash.".to_string()),
                checked_at_ms,
                trust: "failed".to_string(),
            });
        }

        let entry_json = serde_json::to_string(&entry_value).map_err(|error| error.to_string())?;
        let expected_hash = sha256_hex(&format!(
            "{}|{}|{}|{}",
            event_type,
            timestamp_ms,
            entry_json,
            expected_prev.unwrap_or_else(|| "GENESIS".to_string())
        ));

        if stored_hash.clone().unwrap_or_default() != expected_hash {
            return Ok(AuditChainVerificationProof {
                path: file_path.to_string_lossy().to_string(),
                total_entries,
                verified_entries,
                broken_index: Some(index),
                reason: Some("Computed chain hash mismatch.".to_string()),
                checked_at_ms,
                trust: "failed".to_string(),
            });
        }

        verified_entries += 1;
        previous_hash = stored_hash;
    }

    Ok(AuditChainVerificationProof {
        path: file_path.to_string_lossy().to_string(),
        total_entries,
        verified_entries,
        broken_index: None,
        reason: None,
        checked_at_ms,
        trust: "verified".to_string(),
    })
}
