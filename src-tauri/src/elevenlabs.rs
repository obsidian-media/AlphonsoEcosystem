//! ElevenLabs (content factory phase 4b): the user's voices and models, a voice-over
//! with each character's timing, and sound effects. Every call uses the saved key
//! (`ELEVENLABS_API_KEY`, header `xi-api-key`) and never puts it in an error.
//! Audio comes back as MP3 and is turned into WAV with the bundled ffmpeg, so the
//! rest of the pipeline (Assemble) is the same as with Kokoro.

use crate::media_tools::{checked_dir, checked_file, ffmpeg_path, run_ffmpeg, FfmpegRun};
use crate::utils::secret_or_env;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

const BASE: &str = "https://api.elevenlabs.io";

#[derive(Serialize, Debug, PartialEq, Clone)]
pub(crate) struct TimedWord {
  pub word: String,
  pub start: f64,
  pub end: f64,
}

/// Words from ElevenLabs' character timings: each run of non-space characters is a word.
pub(crate) fn words_from_alignment(
  chars: &[String],
  starts: &[f64],
  ends: &[f64],
  offset: f64,
) -> Vec<TimedWord> {
  let mut out = Vec::new();
  let mut word = String::new();
  let mut start = 0.0;
  let mut end = 0.0;
  for (i, c) in chars.iter().enumerate() {
    let (s, e) = (
      starts.get(i).copied().unwrap_or(end),
      ends.get(i).copied().unwrap_or(end),
    );
    if c.trim().is_empty() {
      if !word.is_empty() {
        out.push(TimedWord {
          word: std::mem::take(&mut word),
          start: start + offset,
          end: end + offset,
        });
      }
      continue;
    }
    if word.is_empty() {
      start = s;
    }
    word.push_str(c);
    end = e;
  }
  if !word.is_empty() {
    out.push(TimedWord {
      word,
      start: start + offset,
      end: end + offset,
    });
  }
  out
}

/// A plain reason from an ElevenLabs refusal; never the key.
pub(crate) fn classify_error(status: u16, body: &Value) -> String {
  let detail = body["detail"]["message"]
    .as_str()
    .or_else(|| body["detail"].as_str())
    .unwrap_or("");
  match status {
    401 => {
      "ElevenLabs refused the key: check it in Settings → Connectors → ElevenLabs.".to_string()
    }
    404 => "That ElevenLabs voice is no longer in your account.".to_string(),
    429 => "ElevenLabs says the account is over its limit for now.".to_string(),
    _ if !detail.is_empty() => format!(
      "ElevenLabs: {}",
      detail.chars().take(200).collect::<String>()
    ),
    _ => format!("ElevenLabs answered {status}."),
  }
}

#[derive(Serialize, Debug, PartialEq)]
pub(crate) struct Voice {
  id: String,
  name: String,
  cloned: bool,
}

/// The account's voices; a cloned (or professional) one is marked.
pub(crate) fn parse_voices(body: &Value) -> Vec<Voice> {
  body["voices"]
    .as_array()
    .into_iter()
    .flatten()
    .filter_map(|v| {
      let id = v["voice_id"].as_str()?.to_string();
      let category = v["category"].as_str().unwrap_or("");
      Some(Voice {
        id,
        name: v["name"].as_str().unwrap_or("").to_string(),
        cloned: category == "cloned" || category == "professional",
      })
    })
    .collect()
}

/// Only models that can do text to speech.
pub(crate) fn parse_models(body: &Value) -> Vec<Value> {
  body
    .as_array()
    .into_iter()
    .flatten()
    .filter(|m| m["can_do_text_to_speech"].as_bool() == Some(true))
    .filter_map(|m| Some(serde_json::json!({ "id": m["model_id"].as_str()?, "name": m["name"].as_str().unwrap_or("") })))
    .collect()
}

fn key(passed: Option<String>) -> Result<String, String> {
  let k = secret_or_env(passed, "ELEVENLABS_API_KEY");
  if k.trim().is_empty() {
    Err("Add your ElevenLabs key in Settings → Connectors → ElevenLabs.".to_string())
  } else {
    Ok(k)
  }
}

fn client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .user_agent("Alphonso-ElevenLabs/0.1")
    .build()
    .map_err(|e| e.to_string())
}

fn valid_id(id: &str) -> bool {
  !id.is_empty()
    && id.len() <= 64
    && id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

async fn get_json(path: &str, api_key: &str) -> Result<Value, String> {
  let response = client()?
    .get(format!("{BASE}{path}"))
    .header("xi-api-key", api_key)
    .send()
    .await
    .map_err(|_| "ElevenLabs could not be reached.".to_string())?;
  let status = response.status().as_u16();
  let body: Value = response.json().await.unwrap_or(Value::Null);
  if (200..300).contains(&status) {
    Ok(body)
  } else {
    Err(classify_error(status, &body))
  }
}

#[tauri::command]
pub(crate) async fn elevenlabs_voices(key_override: Option<String>) -> Value {
  match key(key_override) {
    Ok(k) => match get_json("/v1/voices", &k).await {
      Ok(body) => serde_json::json!({ "ok": true, "voices": parse_voices(&body) }),
      Err(reason) => serde_json::json!({ "ok": false, "reason": reason }),
    },
    Err(reason) => serde_json::json!({ "ok": false, "reason": reason }),
  }
}

#[tauri::command]
pub(crate) async fn elevenlabs_models(key_override: Option<String>) -> Value {
  match key(key_override) {
    Ok(k) => match get_json("/v1/models", &k).await {
      Ok(body) => serde_json::json!({ "ok": true, "models": parse_models(&body) }),
      Err(reason) => serde_json::json!({ "ok": false, "reason": reason }),
    },
    Err(reason) => serde_json::json!({ "ok": false, "reason": reason }),
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpeakLine {
  id: String,
  text: String,
  #[serde(default)]
  pause_sec: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpeakRequest {
  workspace_root: String,
  out_dir: String,
  voice_id: String,
  #[serde(default)]
  model_id: Option<String>,
  lines: Vec<SpeakLine>,
  #[serde(default)]
  key: Option<String>,
}

async fn mp3_to_wav(ffmpeg: &Path, dir: &Path, mp3: &str, wav: &str) -> Result<(), String> {
  run_ffmpeg(
    ffmpeg,
    &FfmpegRun {
      cwd: dir.to_path_buf(),
      args: [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        mp3,
        "-ar",
        "44100",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wav,
      ]
      .iter()
      .map(|s| s.to_string())
      .collect(),
    },
  )
  .await
}

async fn silence(ffmpeg: &Path, dir: &Path, seconds: f64, wav: &str) -> Result<(), String> {
  run_ffmpeg(
    ffmpeg,
    &FfmpegRun {
      cwd: dir.to_path_buf(),
      args: vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "anullsrc=r=44100:cl=mono".into(),
        "-t".into(),
        format!("{:.3}", seconds.max(0.1)),
        "-c:a".into(),
        "pcm_s16le".into(),
        wav.into(),
      ],
    },
  )
  .await
}

/// Reads each line with ElevenLabs (one request per line, the neighbours given for
/// continuity), saves `<id>.wav` per line and `full.wav`, and returns every word's timing.
#[tauri::command]
pub(crate) async fn elevenlabs_speak(request: SpeakRequest) -> Value {
  let fail = |reason: String| serde_json::json!({ "ok": false, "reason": reason });
  let api_key = match key(request.key.clone()) {
    Ok(k) => k,
    Err(r) => return fail(r),
  };
  if !valid_id(&request.voice_id) {
    return fail("That is not an ElevenLabs voice id.".to_string());
  }
  let dir = match checked_dir(&request.workspace_root, &request.out_dir) {
    Ok(d) => d,
    Err(r) => return fail(r),
  };
  if std::fs::create_dir_all(&dir).is_err() {
    return fail("The voice-over folder could not be made.".to_string());
  }
  let Some(ffmpeg) = ffmpeg_path() else {
    return fail("ffmpeg is missing from this install.".to_string());
  };
  let Ok(http) = client() else {
    return fail("Could not start the request.".to_string());
  };
  let model = request.model_id.clone().filter(|m| valid_id(m));
  let mut files = Vec::new();
  let mut words: Vec<TimedWord> = Vec::new();
  let mut at = 0.0;
  for (i, line) in request.lines.iter().enumerate() {
    if !valid_id(&line.id) {
      return fail("A line id is not valid.".to_string());
    }
    let wav = format!("{}.wav", line.id);
    let mut seconds = line.pause_sec.unwrap_or(0.5);
    if line.text.trim().is_empty() {
      if let Err(r) = silence(&ffmpeg, &dir, seconds, &wav).await {
        return fail(r);
      }
    } else {
      let mut body = serde_json::json!({ "text": line.text });
      if let Some(m) = &model {
        body["model_id"] = Value::String(m.clone());
      }
      if i > 0 {
        body["previous_text"] = Value::String(request.lines[i - 1].text.clone());
      }
      if let Some(next) = request.lines.get(i + 1) {
        body["next_text"] = Value::String(next.text.clone());
      }
      let url = format!(
        "{BASE}/v1/text-to-speech/{}/with-timestamps?output_format=mp3_44100_128",
        request.voice_id
      );
      let response = match http
        .post(url)
        .header("xi-api-key", &api_key)
        .json(&body)
        .send()
        .await
      {
        Ok(r) => r,
        Err(_) => return fail("ElevenLabs could not be reached.".to_string()),
      };
      let status = response.status().as_u16();
      let answer: Value = response.json().await.unwrap_or(Value::Null);
      if !(200..300).contains(&status) {
        return fail(classify_error(status, &answer));
      }
      let Some(audio) = answer["audio_base64"]
        .as_str()
        .and_then(|b| base64::engine::general_purpose::STANDARD.decode(b).ok())
      else {
        return fail("ElevenLabs sent no audio.".to_string());
      };
      let mp3 = format!("{}.mp3", line.id);
      if std::fs::write(dir.join(&mp3), audio).is_err() {
        return fail("The voice-over could not be saved.".to_string());
      }
      if let Err(r) = mp3_to_wav(&ffmpeg, &dir, &mp3, &wav).await {
        return fail(r);
      }
      let _ = std::fs::remove_file(dir.join(&mp3));
      let align = &answer["alignment"];
      let list = |k: &str| align[k].as_array().cloned().unwrap_or_default();
      let chars: Vec<String> = list("characters")
        .iter()
        .map(|c| c.as_str().unwrap_or("").to_string())
        .collect();
      let starts: Vec<f64> = list("character_start_times_seconds")
        .iter()
        .filter_map(Value::as_f64)
        .collect();
      let ends: Vec<f64> = list("character_end_times_seconds")
        .iter()
        .filter_map(Value::as_f64)
        .collect();
      seconds = ends.last().copied().unwrap_or(seconds);
      words.extend(words_from_alignment(&chars, &starts, &ends, at));
    }
    files.push(
      serde_json::json!({ "id": line.id, "path": wav, "durationSec": seconds, "startSec": at }),
    );
    at += seconds;
  }
  // full.wav: every line in order.
  let list: String = request
    .lines
    .iter()
    .map(|l| format!("file '{}.wav'\n", l.id))
    .collect();
  if std::fs::write(dir.join("lines.txt"), list).is_err() {
    return fail("The voice-over could not be joined.".to_string());
  }
  let join = FfmpegRun {
    cwd: dir.clone(),
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "lines.txt",
      "-c",
      "copy",
      "full.wav",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect(),
  };
  if let Err(r) = run_ffmpeg(&ffmpeg, &join).await {
    return fail(r);
  }
  let _ = std::fs::remove_file(dir.join("lines.txt"));
  serde_json::json!({ "ok": true, "full": { "durationSec": at }, "files": files, "words": words })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SoundRequest {
  workspace_root: String,
  out_path: String,
  text: String,
  seconds: f64,
  #[serde(default)]
  key: Option<String>,
}

/// One sound effect (0.5–30 s) saved as WAV; never over an existing file.
#[tauri::command]
pub(crate) async fn elevenlabs_sound(request: SoundRequest) -> Value {
  let fail = |reason: String| serde_json::json!({ "ok": false, "reason": reason });
  let api_key = match key(request.key.clone()) {
    Ok(k) => k,
    Err(r) => return fail(r),
  };
  let out = match checked_file(&request.workspace_root, &request.out_path, &["wav"]) {
    Ok(p) => p,
    Err(r) => return fail(r),
  };
  if out.exists() {
    return fail("That sound effect's file already exists; nothing was overwritten.".to_string());
  }
  let Some(dir) = out.parent().map(Path::to_path_buf) else {
    return fail("The sound needs a folder.".to_string());
  };
  if std::fs::create_dir_all(&dir).is_err() {
    return fail("The sound folder could not be made.".to_string());
  }
  let Some(ffmpeg) = ffmpeg_path() else {
    return fail("ffmpeg is missing from this install.".to_string());
  };
  let Ok(http) = client() else {
    return fail("Could not start the request.".to_string());
  };
  let body = serde_json::json!({ "text": request.text.chars().take(450).collect::<String>(), "duration_seconds": request.seconds.clamp(0.5, 30.0) });
  let response = match http
    .post(format!(
      "{BASE}/v1/sound-generation?output_format=mp3_44100_128"
    ))
    .header("xi-api-key", &api_key)
    .json(&body)
    .send()
    .await
  {
    Ok(r) => r,
    Err(_) => return fail("ElevenLabs could not be reached.".to_string()),
  };
  let status = response.status().as_u16();
  if !(200..300).contains(&status) {
    let answer: Value = response.json().await.unwrap_or(Value::Null);
    return fail(classify_error(status, &answer));
  }
  let Ok(bytes) = response.bytes().await else {
    return fail("ElevenLabs sent no sound.".to_string());
  };
  let stem = out
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("sfx")
    .to_string();
  let mp3 = format!("{stem}.mp3");
  if std::fs::write(dir.join(&mp3), &bytes).is_err() {
    return fail("The sound could not be saved.".to_string());
  }
  let wav = format!("{stem}.wav");
  let made = mp3_to_wav(&ffmpeg, &dir, &mp3, &wav).await;
  let _ = std::fs::remove_file(dir.join(&mp3));
  match made {
    Ok(()) => serde_json::json!({ "ok": true, "path": request.out_path }),
    Err(r) => fail(r),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn s(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
  }

  #[test]
  fn words_come_from_the_character_timings() {
    let chars = s(&["H", "i", " ", "t", "h", "e", "r", "e"]);
    let starts = [0.0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5];
    let ends = [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6];
    let words = words_from_alignment(&chars, &starts, &ends, 2.0);
    assert_eq!(
      words,
      vec![
        TimedWord {
          word: "Hi".into(),
          start: 2.0,
          end: 2.2
        },
        TimedWord {
          word: "there".into(),
          start: 2.3,
          end: 2.6
        },
      ]
    );
  }

  #[test]
  fn a_cloned_voice_is_marked() {
    let body = json!({ "voices": [
      { "voice_id": "v1", "name": "Rachel", "category": "premade" },
      { "voice_id": "v2", "name": "My voice", "category": "cloned" },
      { "voice_id": "v3", "name": "Pro", "category": "professional" },
    ] });
    let voices = parse_voices(&body);
    assert_eq!(
      voices
        .iter()
        .map(|v| (v.id.as_str(), v.cloned))
        .collect::<Vec<_>>(),
      vec![("v1", false), ("v2", true), ("v3", true)]
    );
  }

  #[test]
  fn only_text_to_speech_models_are_listed() {
    let body = json!([
      { "model_id": "eleven_multilingual_v2", "name": "Multilingual v2", "can_do_text_to_speech": true },
      { "model_id": "eleven_english_sts_v2", "name": "STS", "can_do_text_to_speech": false },
    ]);
    assert_eq!(
      parse_models(&body),
      vec![json!({ "id": "eleven_multilingual_v2", "name": "Multilingual v2" })]
    );
  }

  #[test]
  fn errors_never_carry_the_key() {
    let key = "sk_test_value_never_shown";
    for (status, body) in [
      (
        401,
        json!({ "detail": { "message": format!("bad key {key}") } }),
      ),
      (404, json!({})),
      (429, json!({})),
      (500, json!({ "detail": "server" })),
    ] {
      let reason = classify_error(status, &body);
      assert!(!reason.contains(key) || status != 401, "{reason}");
    }
    assert!(classify_error(
      401,
      &json!({ "detail": { "message": format!("bad key {key}") } })
    )
    .contains("refused the key"));
    assert_eq!(
      classify_error(404, &json!({})),
      "That ElevenLabs voice is no longer in your account."
    );
  }

  #[test]
  fn ids_are_checked_before_anything_is_sent() {
    assert!(valid_id("21m00Tcm4TlvDq8ikWAM"));
    assert!(!valid_id("../voices"));
    assert!(!valid_id("a?b"));
    assert!(!valid_id(""));
  }
}
