//! Runtime Manager — prerequisite detection, install, lifecycle for all AI tools.
//!
//! Gap fixes implemented here:
//!  1. Python detection across PATH + common Windows install locations; winget fallback
//!  2. Git detection across PATH + common Windows install locations; winget fallback
//!  3. Ollama searched in PATH + %LOCALAPPDATA%\Programs\Ollama (no silent failure)
//!  4. Real async line-by-line streaming via tokio process + runtime://log events
//!  5. Per-tool Python venv isolation (venv created before pip install)
//!  6. AudioCraft correct start command (python demos/musicgen_app.py --port 8765)
//!  7. InvokeAI resolved from venv/Scripts (Windows) or venv/bin (Unix)
//!  8. Boot status events (runtime://boot_status) emitted during autostart_all
//!  9. Per-tool autostart toggle persisted to ~/.alphonso/runtimes/autostart_prefs.json

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};

// Windows: prevent child processes from opening visible console windows.
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Apply CREATE_NO_WINDOW on Windows so child processes don't flash CMD windows.
#[allow(unused_variables)]
fn no_window(cmd: &mut Command) -> &mut Command {
  #[cfg(target_os = "windows")]
  cmd.creation_flags(CREATE_NO_WINDOW);
  cmd
}

// ─────────────────────────────────────────────────────────
// Static tool catalogue
// ─────────────────────────────────────────────────────────

#[derive(Clone)]
struct ToolDef {
  name: &'static str,
  display_name: &'static str,
  description: &'static str,
  /// GitHub repo to clone (None = binary / pip-only tool)
  repo_url: Option<&'static str>,
  /// pip packages for pip-only tools (no repo); empty = use requirements.txt
  pip_packages: &'static [&'static str],
  /// requirements.txt relative path inside clone dir
  requirements_file: Option<&'static str>,
  /// HTTP port; None for CLI-only tools
  port: Option<u16>,
  /// Health-check path, e.g. "/api/tags"
  health_path: Option<&'static str>,
  /// "python" → resolved via venv; "ollama" → resolved via find_ollama(); other → venv bin
  exe: &'static str,
  /// Args for the start command (python tools: first arg is the script)
  args: &'static [&'static str],
}

const TOOLS: &[ToolDef] = &[
  ToolDef {
    name: "ollama",
    display_name: "Ollama",
    description: "Local LLM runtime — powers all 9 AI agents",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(11434),
    health_path: Some("/api/tags"),
    exe: "ollama",
    args: &["serve"],
  },
  ToolDef {
    name: "comfyui",
    display_name: "ComfyUI",
    description: "Node-based image & video generation pipeline",
    repo_url: Some("https://github.com/comfyanonymous/ComfyUI"),
    pip_packages: &[],
    requirements_file: Some("requirements.txt"),
    port: Some(8188),
    health_path: Some("/system_stats"),
    exe: "python",
    // script run from install dir with its own venv python
    args: &["main.py", "--port", "8188", "--listen", "127.0.0.1"],
  },
  ToolDef {
    name: "automatic1111",
    display_name: "AUTOMATIC1111 WebUI",
    description: "Stable Diffusion web UI — img2img, inpainting, extensions",
    repo_url: Some("https://github.com/AUTOMATIC1111/stable-diffusion-webui"),
    pip_packages: &[],
    requirements_file: Some("requirements.txt"),
    port: Some(7860),
    health_path: Some("/"),
    exe: "python",
    args: &["launch.py", "--port", "7860", "--api", "--listen", "127.0.0.1"],
  },
  ToolDef {
    name: "fooocus",
    display_name: "Fooocus",
    description: "Simplified Stable Diffusion — Midjourney-style prompting",
    repo_url: Some("https://github.com/lllyasviel/Fooocus"),
    pip_packages: &[],
    requirements_file: Some("requirements_versions.txt"),
    port: Some(7865),
    health_path: Some("/"),
    exe: "python",
    args: &["entry_with_update.py", "--port", "7865", "--listen", "127.0.0.1"],
  },
  ToolDef {
    name: "invokeai",
    display_name: "InvokeAI",
    description: "Professional image generation with canvas & workflow editor",
    repo_url: None,
    pip_packages: &["invokeai"],
    requirements_file: None,
    port: Some(9090),
    health_path: Some("/openapi.json"),
    // Gap 7 fix: resolved from venv bin via resolve_exe()
    exe: "invokeai-web",
    args: &["--host", "127.0.0.1", "--port", "9090"],
  },
  ToolDef {
    name: "whisper",
    display_name: "Whisper",
    description: "OpenAI Whisper — local audio & speech transcription",
    repo_url: None,
    pip_packages: &["openai-whisper", "ffmpeg-python"],
    requirements_file: None,
    port: None,
    health_path: None,
    // resolved from venv bin
    exe: "whisper",
    args: &[],
  },
  ToolDef {
    name: "audiocraft",
    display_name: "AudioCraft / MusicGen",
    description: "Facebook AudioCraft — AI music & audio generation",
    repo_url: Some("https://github.com/facebookresearch/audiocraft"),
    pip_packages: &[],
    requirements_file: Some("requirements.txt"),
    port: Some(7866),
    health_path: Some("/"),
    exe: "python",
    // Gap 6 fix: correct entry point — file path, not module syntax
    args: &["demos/musicgen_app.py", "--server_name", "127.0.0.1", "--server_port", "7866"],
  },
  ToolDef {
    name: "openwebui",
    display_name: "Open WebUI",
    description: "ChatGPT-style web interface for Ollama and OpenAI-compatible models",
    repo_url: Some("https://github.com/open-webui/open-webui"),
    pip_packages: &["open-webui"],
    requirements_file: None,
    port: Some(3001),
    health_path: Some("/health"),
    exe: "open-webui",
    args: &["serve", "--host", "127.0.0.1", "--port", "3001"],
  },
  ToolDef {
    name: "voice-os",
    display_name: "Voice OS",
    description: "Alphonso Voice OS — STT (faster-whisper) + LLM + TTS (piper) WebSocket pipeline on :8765",
    repo_url: None,
    pip_packages: &[
      "faster-whisper",
      "piper-tts",
      "webrtcvad",
      "fastapi",
      "uvicorn[standard]",
      "websockets",
      "numpy",
    ],
    requirements_file: None,
    port: Some(8765),
    health_path: Some("/health"),
    exe: "python",
    args: &["voice/backend/main.py", "--host", "127.0.0.1", "--port", "8765"],
  },
  ToolDef {
    name: "n8n",
    display_name: "n8n",
    description: "n8n — local workflow automation engine (Docker)",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(5678),
    health_path: Some("/healthz"),
    exe: "docker",
    args: &["run", "-d", "--name", "n8n", "-p", "5678:5678", "-v", "n8n_data:/home/node/.n8n", "n8nio/n8n"],
  },
  ToolDef {
    name: "mcp-server",
    display_name: "MCP Server",
    description: "Exposes Alphonso as an MCP tool server on port 3333 — callable from Claude Desktop, Cursor, Windsurf, and any MCP-compatible AI tool. Requires Node.js.",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(3333),
    health_path: Some("/health"),
    exe: "node",
    args: &["mcp-server/server.js"],
  },
  ToolDef {
    name: "alphonso-bridge",
    display_name: "Alphonso Bridge",
    description: "HTTP bridge on port 4444 — connects MCP server to Alphonso frontend. Required for MCP server to queue tasks. Start before MCP Server.",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(4444),
    health_path: Some("/health"),
    exe: "node",
    args: &["bridge/server.js"],
  },
  ToolDef {
    name: "chromadb",
    display_name: "ChromaDB",
    description: "Local vector database — powers Echo semantic memory search (find related memories without exact keyword matching)",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(8000),
    health_path: Some("/api/v1/heartbeat"),
    exe: "docker",
    args: &["run", "--rm", "-p", "8000:8000", "--name", "alphonso-chroma", "chromadb/chroma"],
  },
  ToolDef {
    name: "openHands",
    display_name: "OpenHands",
    description: "AI software agent — writes code, runs terminal commands, browses web in a Docker sandbox. Pairs with ACC Bridge for Jose delegation.",
    repo_url: None,
    pip_packages: &[],
    requirements_file: None,
    port: Some(3000),
    health_path: Some("/api/health"),
    exe: "docker",
    args: &[
      "run", "--rm", "-d",
      "-p", "3000:3000",
      "-e", "SANDBOX_RUNTIME_CONTAINER_IMAGE=ghcr.io/all-hands-ai/runtime:0.38",
      "-v", "/var/run/docker.sock:/var/run/docker.sock",
      "--add-host", "host.docker.internal:host-gateway",
      "ghcr.io/all-hands-ai/openhands:main",
    ],
  },
];

fn tool_def(name: &str) -> Option<&'static ToolDef> {
  TOOLS.iter().find(|t| t.name == name)
}

// ─────────────────────────────────────────────────────────
// Directory helpers
// ─────────────────────────────────────────────────────────

pub fn runtimes_dir() -> PathBuf {
  let base = std::env::var("APPDATA")
    .map(PathBuf::from)
    .unwrap_or_else(|_| {
      std::env::var("HOME")
        .map(|h| PathBuf::from(h).join(".alphonso"))
        .unwrap_or_else(|_| PathBuf::from(".alphonso"))
    });
  if cfg!(target_os = "windows") {
    base.join("Alphonso").join("runtimes")
  } else {
    base.join("runtimes")
  }
}

fn tool_dir(name: &str) -> PathBuf {
  runtimes_dir().join(name)
}

fn prefs_path() -> PathBuf {
  runtimes_dir().join("autostart_prefs.json")
}

// ─────────────────────────────────────────────────────────
// Autostart preferences (Gap 9)
// ─────────────────────────────────────────────────────────

fn load_autostart_prefs() -> HashMap<String, bool> {
  load_autostart_prefs_from(&prefs_path())
}

// Path-parameterized so tests can point at an isolated temp file instead of
// the real %APPDATA%\Alphonso\runtimes\autostart_prefs.json — reading the
// real file made the "defaults" test fail on any machine that had actually
// run the app (a real prefs file with non-default values always wins over
// the hardcoded defaults below).
fn load_autostart_prefs_from(path: &std::path::Path) -> HashMap<String, bool> {
  if let Ok(content) = std::fs::read_to_string(path) {
    if let Ok(map) = serde_json::from_str::<HashMap<String, bool>>(&content) {
      return map;
    }
  }
  // Default: only Ollama auto-starts; others require opt-in
  let mut defaults = HashMap::new();
  defaults.insert("ollama".to_string(), true);
  for def in TOOLS.iter().skip(1) {
    defaults.insert(def.name.to_string(), false);
  }
  defaults
}

fn save_autostart_prefs_to_disk(prefs: &HashMap<String, bool>) {
  let _ = std::fs::create_dir_all(runtimes_dir());
  if let Ok(json) = serde_json::to_string_pretty(prefs) {
    let _ = std::fs::write(prefs_path(), json);
  }
}

// ─────────────────────────────────────────────────────────
// Prerequisite detection (Gaps 1, 2, 3)
// ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrereqStatus {
  pub python_found: bool,
  pub python_path: Option<String>,
  pub python_version: Option<String>,
  pub git_found: bool,
  pub git_path: Option<String>,
  pub git_version: Option<String>,
  pub ollama_found: bool,
  pub ollama_path: Option<String>,
  pub docker_found: bool,
  pub docker_path: Option<String>,
  pub node_found: bool,
  pub node_path: Option<String>,
  pub missing: Vec<String>,
  pub install_hint: String,
}

/// Gap 1: find Python across PATH + common Windows install locations
pub fn find_python() -> Option<String> {
  let candidates: &[&str] = if cfg!(target_os = "windows") {
    &[
      "python",
      "python3",
      "python3.12",
      "python3.11",
      "python3.10",
    ]
  } else {
    &[
      "python3",
      "python3.12",
      "python3.11",
      "python3.10",
      "python",
    ]
  };

  for name in candidates {
    let mut cmd = Command::new(name);
    cmd
      .arg("--version")
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null());
    no_window(&mut cmd);
    if cmd.status().map(|s| s.success()).unwrap_or(false) {
      return Some((*name).to_string());
    }
  }

  // Gap 1: Windows-specific fallback paths
  if cfg!(target_os = "windows") {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let user = std::env::var("USERPROFILE").unwrap_or_default();
    let win_paths = [
      format!(r"{}\Programs\Python\Python312\python.exe", local),
      format!(r"{}\Programs\Python\Python311\python.exe", local),
      format!(r"{}\Programs\Python\Python310\python.exe", local),
      r"C:\Python312\python.exe".to_string(),
      r"C:\Python311\python.exe".to_string(),
      r"C:\Python310\python.exe".to_string(),
      format!(
        r"{}\AppData\Local\Programs\Python\Python312\python.exe",
        user
      ),
      format!(
        r"{}\AppData\Local\Programs\Python\Python311\python.exe",
        user
      ),
    ];
    for p in &win_paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else if cfg!(target_os = "macos") {
    let home = std::env::var("HOME").unwrap_or_default();
    let mac_paths = [
      "/opt/homebrew/bin/python3".to_string(),
      "/opt/homebrew/opt/python3/bin/python3".to_string(),
      "/usr/local/bin/python3".to_string(),
      "/usr/bin/python3".to_string(),
      format!(
        "{}/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
        home
      ),
      format!(
        "{}/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
        home
      ),
      "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3".to_string(),
      "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3".to_string(),
    ];
    for p in &mac_paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else {
    // Linux
    let home = std::env::var("HOME").unwrap_or_default();
    let linux_paths = [
      "/usr/bin/python3".to_string(),
      "/usr/local/bin/python3".to_string(),
      "/snap/bin/python3".to_string(),
      format!("{}/.local/bin/python3", home),
      format!("{}/.linuxbrew/bin/python3", home),
      "/home/linuxbrew/.linuxbrew/bin/python3".to_string(),
    ];
    for p in &linux_paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  }
  None
}

fn python_version(exe: &str) -> Option<String> {
  let mut cmd = Command::new(exe);
  cmd.arg("--version");
  no_window(&mut cmd);
  cmd
    .output()
    .ok()
    .map(|o| {
      String::from_utf8_lossy(&o.stdout)
        .trim()
        .to_string()
        .replace("Python ", "")
    })
    .filter(|s| !s.is_empty())
}

/// Parse a Python version string like "3.11.4" into (3, 11).
fn parse_python_version(version: &str) -> Option<(u32, u32)> {
  let parts: Vec<&str> = version.split('.').collect();
  if parts.len() >= 2 {
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    Some((major, minor))
  } else {
    None
  }
}

/// Gap 2: find Git across PATH + common Windows install locations
pub fn find_git() -> Option<String> {
  if which_exe("git") {
    return Some("git".to_string());
  }
  if cfg!(target_os = "windows") {
    let paths = [
      r"C:\Program Files\Git\cmd\git.exe",
      r"C:\Program Files (x86)\Git\cmd\git.exe",
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some((*p).to_string());
      }
    }
  } else if cfg!(target_os = "macos") {
    let paths = [
      "/opt/homebrew/bin/git",
      "/usr/local/bin/git",
      "/usr/bin/git",
      "/Library/Developer/CommandLineTools/usr/bin/git",
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some((*p).to_string());
      }
    }
  } else {
    let paths = ["/usr/bin/git", "/usr/local/bin/git", "/snap/bin/git"];
    for p in &paths {
      if Path::new(p).exists() {
        return Some((*p).to_string());
      }
    }
  }
  None
}

fn git_version(exe: &str) -> Option<String> {
  let mut cmd = Command::new(exe);
  cmd.arg("--version");
  no_window(&mut cmd);
  cmd
    .output()
    .ok()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .filter(|s| !s.is_empty())
}

/// Gap 3: find Ollama across PATH + common Windows install locations
pub fn find_ollama() -> Option<String> {
  if which_exe("ollama") {
    return Some("ollama".to_string());
  }
  if cfg!(target_os = "windows") {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let user = std::env::var("USERPROFILE").unwrap_or_default();
    let paths = [
      format!(r"{}\Programs\Ollama\ollama.exe", local),
      format!(r"{}\AppData\Local\Programs\Ollama\ollama.exe", user),
      r"C:\Program Files\Ollama\ollama.exe".to_string(),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else if cfg!(target_os = "macos") {
    let paths = [
      "/opt/homebrew/bin/ollama".to_string(),
      "/usr/local/bin/ollama".to_string(),
      "/Applications/Ollama.app/Contents/Resources/ollama".to_string(),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else {
    let home = std::env::var("HOME").unwrap_or_default();
    let paths = [
      "/usr/local/bin/ollama".to_string(),
      "/usr/bin/ollama".to_string(),
      format!("{}/.local/bin/ollama", home),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  }
  None
}

/// S-06: find Docker across PATH + common Windows install locations
pub fn find_docker() -> Option<String> {
  if which_exe("docker") {
    return Some("docker".to_string());
  }
  if cfg!(target_os = "windows") {
    let paths = [
      r"C:\Program Files\Docker\Docker\resources\bin\docker.exe".to_string(),
      r"C:\ProgramData\DockerDesktop\version-bin\docker.exe".to_string(),
      {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        format!(r"{}\Docker\cli-plugins\docker.exe", local)
      },
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else if cfg!(target_os = "macos") {
    let paths = [
      "/Applications/Docker.app/Contents/Resources/bin/docker".to_string(),
      "/usr/local/bin/docker".to_string(),
      "/opt/homebrew/bin/docker".to_string(),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else {
    let paths = [
      "/usr/bin/docker".to_string(),
      "/usr/local/bin/docker".to_string(),
      "/snap/bin/docker".to_string(),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  }
  None
}

/// S-07: find Node.js across PATH + common install locations
pub fn find_node() -> Option<String> {
  if which_exe("node") {
    return Some("node".to_string());
  }
  if cfg!(target_os = "windows") {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let paths = [
      format!(r"{}\Programs\node\node.exe", local),
      r"C:\Program Files\nodejs\node.exe".to_string(),
      r"C:\Program Files (x86)\nodejs\node.exe".to_string(),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else if cfg!(target_os = "macos") {
    let home = std::env::var("HOME").unwrap_or_default();
    let paths = [
      "/opt/homebrew/bin/node".to_string(),
      "/usr/local/bin/node".to_string(),
      format!("{}/.nvm/current/bin/node", home),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  } else {
    let home = std::env::var("HOME").unwrap_or_default();
    let paths = [
      "/usr/bin/node".to_string(),
      "/usr/local/bin/node".to_string(),
      format!("{}/.nvm/current/bin/node", home),
      format!("{}/.local/bin/node", home),
    ];
    for p in &paths {
      if Path::new(p).exists() {
        return Some(p.clone());
      }
    }
  }
  None
}

// ─────────────────────────────────────────────────────────
// Public data types
// ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
  pub name: String,
  pub display_name: String,
  pub description: String,
  pub installed: bool,
  pub running: bool,
  pub port: Option<u16>,
  pub pid: Option<u32>,
  pub started_by_us: bool,
  pub auto_start: bool,
  pub install_dir: String,
  pub repo_url: Option<String>,
  pub health_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProgress {
  pub tool: String,
  pub stage: String,
  pub message: String,
  pub pct: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogLine {
  pub tool: String,
  pub line: String,
  pub stream: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBootStatus {
  pub tool: String,
  pub display_name: String,
  pub status: String, // "starting" | "running" | "skipped" | "failed"
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeActionResult {
  pub tool: String,
  pub ok: bool,
  pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStartFailed {
  pub tool: String,
}

// ─────────────────────────────────────────────────────────
// Runtime Manager state
// ─────────────────────────────────────────────────────────

#[derive(Default)]
pub struct RuntimeManager {
  spawned: Arc<Mutex<HashMap<String, u32>>>,
}

impl RuntimeManager {
  pub fn new() -> Self {
    Self {
      spawned: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn spawned_pid(&self, name: &str) -> Option<u32> {
    self.spawned.lock().ok()?.get(name).copied()
  }

  pub fn record_pid(&self, name: &str, pid: u32) {
    if let Ok(mut map) = self.spawned.lock() {
      map.insert(name.to_string(), pid);
    }
  }

  pub fn remove_pid(&self, name: &str) {
    if let Ok(mut map) = self.spawned.lock() {
      map.remove(name);
    }
  }
}

// ─────────────────────────────────────────────────────────
// Health checks
// ─────────────────────────────────────────────────────────

fn is_running_sync(port: u16) -> bool {
  use std::net::TcpStream;
  use std::time::Duration;
  TcpStream::connect_timeout(
    &format!("127.0.0.1:{}", port).parse().expect("valid addr"),
    Duration::from_millis(400),
  )
  .is_ok()
}

async fn is_running_async(port: u16, health_path: &str) -> bool {
  let url = format!("http://127.0.0.1:{}{}", port, health_path);
  match reqwest::Client::builder()
    .timeout(std::time::Duration::from_millis(600))
    .build()
  {
    Ok(client) => client.get(&url).send().await.is_ok(),
    Err(_) => false,
  }
}

// ─────────────────────────────────────────────────────────
// Gap 4: Real async line-by-line streaming
// ─────────────────────────────────────────────────────────

fn emit_progress(app: &AppHandle, tool: &str, stage: &str, msg: &str, pct: u8) {
  let _ = app.emit(
    "runtime://progress",
    RuntimeProgress {
      tool: tool.to_string(),
      stage: stage.to_string(),
      message: msg.to_string(),
      pct,
    },
  );
}

fn emit_log(app: &AppHandle, tool: &str, line: &str, stream: &str) {
  let _ = app.emit(
    "runtime://log",
    RuntimeLogLine {
      tool: tool.to_string(),
      line: line.to_string(),
      stream: stream.to_string(),
    },
  );
}

/// Gap 4 fix: async streaming command — emits each stdout/stderr line as runtime://log event.
async fn run_streaming(
  app: &AppHandle,
  tool: &str,
  program: &str,
  args: &[&str],
  cwd: Option<&Path>,
) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  #[allow(unused_imports)]
  use std::os::windows::process::CommandExt as TokioCommandExt;
  use tokio::process::Command as TokioCommand;

  let mut cmd = TokioCommand::new(program);
  cmd.args(args);
  if let Some(dir) = cwd {
    cmd.current_dir(dir);
  }
  cmd.stdout(std::process::Stdio::piped());
  cmd.stderr(std::process::Stdio::piped());
  cmd.kill_on_drop(true);
  #[cfg(target_os = "windows")]
  cmd.creation_flags(CREATE_NO_WINDOW);

  let mut child = cmd
    .spawn()
    .map_err(|e| format!("Failed to spawn '{}': {}", program, e))?;

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let app_stdout = app.clone();
  let tool_stdout = tool.to_string();
  let stdout_task = tokio::spawn(async move {
    if let Some(out) = stdout {
      let mut lines = BufReader::new(out).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        emit_log(&app_stdout, &tool_stdout, &line, "stdout");
      }
    }
  });

  let app_stderr = app.clone();
  let tool_stderr = tool.to_string();
  let stderr_task = tokio::spawn(async move {
    if let Some(err) = stderr {
      let mut lines = BufReader::new(err).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        emit_log(&app_stderr, &tool_stderr, &line, "stderr");
      }
    }
  });

  let status = child
    .wait()
    .await
    .map_err(|e| format!("Wait failed: {}", e))?;

  let _ = tokio::join!(stdout_task, stderr_task);

  if !status.success() {
    return Err(format!(
      "'{}' exited with code {:?}",
      program,
      status.code()
    ));
  }
  Ok(())
}

// ─────────────────────────────────────────────────────────
// Gap 5: Per-tool venv isolation
// ─────────────────────────────────────────────────────────

fn venv_python(dir: &Path) -> PathBuf {
  if cfg!(target_os = "windows") {
    dir.join("venv").join("Scripts").join("python.exe")
  } else {
    dir.join("venv").join("bin").join("python3")
  }
}

/// Gap 5 & 7: resolve the correct executable for a tool.
/// Python-launched tools use venv/Scripts/python.exe (Windows) or venv/bin/python3.
/// Pip-only CLI tools (invokeai-web, whisper) use venv/Scripts/<exe>.exe on Windows.
fn resolve_exe(def: &ToolDef, install_dir: &Path) -> String {
  if def.exe == "python" {
    // Use venv python if available, else fall back to system python
    let vpy = venv_python(install_dir);
    if vpy.exists() {
      return vpy.to_string_lossy().to_string();
    }
    return find_python().unwrap_or_else(|| "python".to_string());
  }

  // Gap 7: pip CLI tools — look inside venv first
  let venv_bin = if cfg!(target_os = "windows") {
    let with_ext = install_dir
      .join("venv")
      .join("Scripts")
      .join(format!("{}.exe", def.exe));
    if with_ext.exists() {
      with_ext
    } else {
      install_dir.join("venv").join("Scripts").join(def.exe)
    }
  } else {
    install_dir.join("venv").join("bin").join(def.exe)
  };

  if venv_bin.exists() {
    return venv_bin.to_string_lossy().to_string();
  }

  // For Ollama: use find_ollama path
  if def.exe == "ollama" {
    return find_ollama().unwrap_or_else(|| "ollama".to_string());
  }

  def.exe.to_string()
}

/// Gap 5: create an isolated venv for a tool (idempotent).
async fn ensure_venv(app: &AppHandle, tool: &str, py: &str, dir: &Path) -> Result<(), String> {
  let venv_dir = dir.join("venv");
  if venv_dir.exists() {
    return Ok(());
  }
  emit_progress(
    app,
    tool,
    "venv",
    "Creating isolated Python environment…",
    45,
  );
  run_streaming(app, tool, py, &["-m", "venv", "venv"], Some(dir))
    .await
    .map_err(|e| format!("venv creation failed: {}", e))
}

// ─────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn runtime_check_prerequisites() -> PrereqStatus {
  let python_path = find_python();
  let python_version = python_path.as_deref().and_then(python_version);

  let git_path = find_git();
  let git_version = git_path.as_deref().and_then(git_version);

  let ollama_path = find_ollama();

  let docker_path = find_docker();

  let node_path = find_node();

  let mut missing = Vec::new();
  if python_path.is_none() {
    missing.push("Python 3.10+".to_string());
  }
  if git_path.is_none() {
    missing.push("Git".to_string());
  }
  if ollama_path.is_none() {
    missing.push("Ollama".to_string());
  }
  if docker_path.is_none() {
    missing.push("Docker".to_string());
  }
  if node_path.is_none() {
    missing.push("Node.js".to_string());
  }

  let hint = if missing.is_empty() {
    "All prerequisites found.".to_string()
  } else if cfg!(target_os = "windows") {
    format!(
      "Missing: {}. Install with winget or download manually.",
      missing.join(", ")
    )
  } else {
    format!(
      "Missing: {}. Install via your package manager.",
      missing.join(", ")
    )
  };

  PrereqStatus {
    python_found: python_path.is_some(),
    python_path,
    python_version,
    git_found: git_path.is_some(),
    git_path,
    git_version,
    ollama_found: ollama_path.is_some(),
    ollama_path,
    docker_found: docker_path.is_some(),
    docker_path,
    node_found: node_path.is_some(),
    node_path,
    missing,
    install_hint: hint,
  }
}

/// Gap 1 & 2: install missing prerequisites via winget (Windows) or brew (Mac).
#[tauri::command]
pub async fn runtime_install_prerequisite(
  name: String,
  app: AppHandle,
) -> Result<RuntimeActionResult, String> {
  let (winget_id, brew_pkg, apt_pkg) = match name.as_str() {
    "python" => ("Python.Python.3.11", "python@3.11", "python3"),
    "git" => ("Git.Git", "git", "git"),
    "ollama" => ("Ollama.Ollama", "ollama", "ollama"),
    _ => return Err(format!("Unknown prerequisite: {}", name)),
  };

  emit_progress(
    &app,
    &name,
    "installing",
    &format!("Installing {}…", name),
    10,
  );

  if cfg!(target_os = "windows") {
    run_streaming(
      &app,
      &name,
      "winget",
      &[
        "install",
        "--id",
        winget_id,
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      None,
    )
    .await
    .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
  } else if cfg!(target_os = "macos") {
    run_streaming(&app, &name, "brew", &["install", brew_pkg], None)
      .await
      .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
  } else if which_exe("apt-get") || which_exe("apt") {
    let apt_cmd = if which_exe("apt-get") {
      "apt-get"
    } else {
      "apt"
    };
    run_streaming(
      &app,
      &name,
      "sudo",
      &[apt_cmd, "install", "-y", apt_pkg],
      None,
    )
    .await
    .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
  } else {
    let msg = "Automatic install is only supported on Debian/Ubuntu-based Linux (apt) in this build. Your distro's package manager (e.g. dnf, pacman, zypper) was not detected — please install this prerequisite manually.".to_string();
    emit_progress(&app, &name, "error", &msg, 0);
    return Err(msg);
  }

  emit_progress(&app, &name, "done", &format!("{} installed.", name), 100);
  Ok(RuntimeActionResult {
    tool: name.clone(),
    ok: true,
    message: format!("{} installed successfully.", name),
  })
}

#[tauri::command]
pub async fn runtime_get_all_status(
  state: tauri::State<'_, RuntimeManager>,
) -> Result<Vec<ToolStatus>, String> {
  let prefs = load_autostart_prefs();
  let mut statuses = Vec::new();

  for def in TOOLS {
    let dir = tool_dir(def.name);

    let installed = match (def.repo_url, def.exe) {
      (Some(_), _) => dir.exists() && dir.join(".git").exists(),
      (None, "ollama") => find_ollama().is_some(),
      (None, exe) => {
        // Check venv bin first, then PATH
        let venv_bin = if cfg!(target_os = "windows") {
          dir
            .join("venv")
            .join("Scripts")
            .join(format!("{}.exe", exe))
        } else {
          dir.join("venv").join("bin").join(exe)
        };
        venv_bin.exists() || which_exe(exe)
      }
    };

    let (running, pid) = if let Some(port) = def.port {
      let up = is_running_sync(port);
      let pid = if up {
        state.spawned_pid(def.name)
      } else {
        None
      };
      (up, pid)
    } else {
      let pid = state.spawned_pid(def.name);
      (pid.is_some(), pid)
    };

    statuses.push(ToolStatus {
      name: def.name.to_string(),
      display_name: def.display_name.to_string(),
      description: def.description.to_string(),
      installed,
      running,
      port: def.port,
      pid,
      started_by_us: state.spawned_pid(def.name).is_some(),
      auto_start: prefs.get(def.name).copied().unwrap_or(def.name == "ollama"),
      install_dir: dir.to_string_lossy().to_string(),
      repo_url: def.repo_url.map(str::to_string),
      health_url: def
        .port
        .zip(def.health_path)
        .map(|(p, h)| format!("http://127.0.0.1:{}{}", p, h)),
    });
  }
  Ok(statuses)
}

#[tauri::command]
pub async fn runtime_install_tool(
  name: String,
  app: AppHandle,
) -> Result<RuntimeActionResult, String> {
  let def = tool_def(&name).ok_or_else(|| format!("Unknown tool: {}", name))?;

  // ── Prerequisite check before doing anything ──────────────
  let py_path = find_python().ok_or_else(|| {
    "Python not found. Install Python 3.10+ first (use the Prerequisites panel).".to_string()
  });
  let git_path = find_git()
    .ok_or_else(|| "Git not found. Install Git first (use the Prerequisites panel).".to_string());

  // Only fail on missing python/git if we actually need them
  if def.exe == "python" || def.requirements_file.is_some() || !def.pip_packages.is_empty() {
    py_path.as_ref().map_err(|e| e.clone())?;
  }
  if def.repo_url.is_some() {
    git_path.as_ref().map_err(|e| e.clone())?;
  }

  let py = py_path.unwrap_or_else(|_| "python".to_string());
  let git = git_path.unwrap_or_else(|_| "git".to_string());

  let dir = tool_dir(def.name);
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  emit_progress(&app, &name, "starting", "Starting installation…", 0);

  // ── Step 1: git clone ─────────────────────────────────────
  if let Some(url) = def.repo_url {
    if !dir.join(".git").exists() {
      emit_progress(&app, &name, "cloning", &format!("Cloning {} …", url), 10);
      run_streaming(
        &app,
        &name,
        &git,
        &["clone", "--depth", "1", url, "."],
        Some(&dir),
      )
      .await
      .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
      emit_progress(&app, &name, "cloned", "Repository cloned.", 40);
    } else {
      emit_progress(&app, &name, "cloned", "Repository already cloned.", 40);
    }
  }

  // ── Step 2: create isolated venv (Gap 5) ─────────────────
  if def.exe == "python" || !def.pip_packages.is_empty() {
    ensure_venv(&app, &name, &py, &dir)
      .await
      .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
  }

  // Use venv python for all pip operations
  let vpy = venv_python(&dir);
  let pip_py = if vpy.exists() {
    vpy.to_string_lossy().to_string()
  } else {
    py.clone()
  };

  // ── Step 3: pip install deps ──────────────────────────────
  if let Some(req) = def.requirements_file {
    if dir.join(req).exists() {
      emit_progress(
        &app,
        &name,
        "installing_deps",
        "Installing Python dependencies…",
        55,
      );
      run_streaming(
        &app,
        &name,
        &pip_py,
        &["-m", "pip", "install", "-r", req, "--progress-bar", "off"],
        Some(&dir),
      )
      .await
      .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
    }
  } else if !def.pip_packages.is_empty() {
    emit_progress(
      &app,
      &name,
      "installing_deps",
      &format!("pip install {} …", def.pip_packages.join(" ")),
      55,
    );
    let mut args = vec!["-m", "pip", "install", "--progress-bar", "off"];
    args.extend_from_slice(def.pip_packages);
    run_streaming(&app, &name, &pip_py, &args, Some(&dir))
      .await
      .inspect_err(|e| emit_progress(&app, &name, "error", e, 0))?;
  }

  // S-08: AudioCraft Python version check — warn if Python >= 3.12
  if name == "audiocraft" {
    let vpy = venv_python(&dir);
    let py_for_check = if vpy.exists() {
      vpy.to_string_lossy().to_string()
    } else {
      py.clone()
    };
    if let Some(ver) = python_version(&py_for_check) {
      if let Some((major, minor)) = parse_python_version(&ver) {
        if major > 3 || (major == 3 && minor >= 12) {
          emit_progress(
            &app,
            &name,
            "warning",
            &format!(
              "AudioCraft requires Python 3.9\u{2013}3.11. Found Python {}.{}",
              major, minor
            ),
            90,
          );
        }
      }
    }
  }

  emit_progress(
    &app,
    &name,
    "done",
    &format!("{} installed successfully.", def.display_name),
    100,
  );
  Ok(RuntimeActionResult {
    tool: name,
    ok: true,
    message: format!("{} installed.", def.display_name),
  })
}

#[tauri::command]
pub async fn runtime_start_tool(
  name: String,
  state: tauri::State<'_, RuntimeManager>,
  app: AppHandle,
) -> Result<RuntimeActionResult, String> {
  let def = tool_def(&name).ok_or_else(|| format!("Unknown tool: {}", name))?;

  if let Some(port) = def.port {
    if is_running_async(port, def.health_path.unwrap_or("/")).await {
      return Ok(RuntimeActionResult {
        tool: name,
        ok: true,
        message: format!("{} is already running on port {}.", def.display_name, port),
      });
    }
  }

  let dir = tool_dir(def.name);
  let exe = resolve_exe(def, &dir);

  // voice-os: resolve script path relative to app resource directory
  if name == "voice-os" {
    let resource_dir = app
      .path()
      .resource_dir()
      .map_err(|e| format!("Resource dir: {e}"))?;
    let backend_dir = resource_dir.join("voice").join("backend");
    let vpy = venv_python(&dir);
    let py = if vpy.exists() {
      vpy.to_string_lossy().to_string()
    } else {
      "python".to_string()
    };
    let script = backend_dir.join("main.py");
    let mut cmd = Command::new(&py);
    cmd
      .arg(&script)
      .args(["--host", "127.0.0.1", "--port", "8765"]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    no_window(&mut cmd);
    let child = cmd
      .spawn()
      .map_err(|e| format!("Failed to start Voice OS: {e}"))?;
    let pid = child.id();
    state.record_pid(&name, pid);
    // S-10: post-spawn health check — emit failure event if process dies within 3 s
    {
      let app_clone = app.clone();
      let name_clone = name.clone();
      tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        if !is_pid_alive(pid) {
          let _ = app_clone.emit(
            "runtime://tool_start_failed",
            ToolStartFailed { tool: name_clone },
          );
        }
      });
    }
    return Ok(RuntimeActionResult {
      tool: name,
      ok: true,
      message: format!("Voice OS started (PID {pid}). Allow a few seconds for initialization."),
    });
  }

  // For python tools, first arg is the script path — use venv python
  let mut cmd = Command::new(&exe);
  cmd.args(def.args);
  if def.repo_url.is_some() || def.exe == "python" {
    cmd.current_dir(&dir);
  }
  cmd.stdout(std::process::Stdio::null());
  cmd.stderr(std::process::Stdio::null());
  no_window(&mut cmd);

  let child = cmd
    .spawn()
    .map_err(|e| format!("Failed to start {} ('{}'):\n{}", def.display_name, exe, e))?;

  let pid = child.id();
  state.record_pid(&name, pid);

  // S-10: post-spawn health check — emit failure event if process dies within 3 s
  {
    let app_clone = app.clone();
    let name_clone = name.clone();
    tokio::spawn(async move {
      tokio::time::sleep(std::time::Duration::from_secs(3)).await;
      if !is_pid_alive(pid) {
        let _ = app_clone.emit(
          "runtime://tool_start_failed",
          ToolStartFailed { tool: name_clone },
        );
      }
    });
  }

  Ok(RuntimeActionResult {
    tool: name,
    ok: true,
    message: format!(
      "{} started (PID {}). Allow a few seconds.",
      def.display_name, pid
    ),
  })
}

#[tauri::command]
pub async fn runtime_stop_tool(
  name: String,
  state: tauri::State<'_, RuntimeManager>,
) -> Result<RuntimeActionResult, String> {
  let def = tool_def(&name).ok_or_else(|| format!("Unknown tool: {}", name))?;

  if let Some(pid) = state.spawned_pid(&name) {
    kill_pid(pid);
    state.remove_pid(&name);
    return Ok(RuntimeActionResult {
      tool: name,
      ok: true,
      message: format!("{} stopped (PID {}).", def.display_name, pid),
    });
  }

  Ok(RuntimeActionResult {
    tool: name.clone(),
    ok: false,
    message: format!(
      "{} was not started by Alphonso — stop it manually.",
      def.display_name
    ),
  })
}

#[tauri::command]
pub fn runtime_list_tools() -> Vec<serde_json::Value> {
  TOOLS
    .iter()
    .map(|t| {
      serde_json::json!({
        "name": t.name,
        "displayName": t.display_name,
        "description": t.description,
        "repoUrl": t.repo_url,
        "port": t.port,
        "installDir": tool_dir(t.name).to_string_lossy(),
      })
    })
    .collect()
}

/// Gap 9: get per-tool autostart preferences.
#[tauri::command]
pub fn runtime_get_autostart_prefs() -> HashMap<String, bool> {
  load_autostart_prefs()
}

/// Gap 9: save a single tool's autostart preference.
#[tauri::command]
pub fn runtime_save_autostart_pref(name: String, enabled: bool) -> Result<(), String> {
  tool_def(&name).ok_or_else(|| format!("Unknown tool: {}", name))?;
  let mut prefs = load_autostart_prefs();
  prefs.insert(name, enabled);
  save_autostart_prefs_to_disk(&prefs);
  Ok(())
}

// ─────────────────────────────────────────────────────────
// Gap 8: Boot-time autostart with status events
// ─────────────────────────────────────────────────────────

/// Called from lib.rs setup() — auto-starts tools according to saved preferences.
pub fn autostart_all(state: Arc<RuntimeManager>, app: AppHandle) {
  std::thread::spawn(move || {
    let prefs = load_autostart_prefs();

    for def in TOOLS {
      let should_start = prefs.get(def.name).copied().unwrap_or(def.name == "ollama");
      if !should_start {
        continue;
      }

      // Check if installed
      let dir = tool_dir(def.name);
      let installed = match (def.repo_url, def.exe) {
        (Some(_), _) => dir.join(".git").exists(),
        (None, "ollama") => find_ollama().is_some(),
        (None, exe) => {
          let venv_bin = if cfg!(target_os = "windows") {
            dir
              .join("venv")
              .join("Scripts")
              .join(format!("{}.exe", exe))
          } else {
            dir.join("venv").join("bin").join(exe)
          };
          venv_bin.exists() || which_exe(exe)
        }
      };

      if !installed {
        // Gap 8: emit skipped status
        let _ = app.emit(
          "runtime://boot_status",
          RuntimeBootStatus {
            tool: def.name.to_string(),
            display_name: def.display_name.to_string(),
            status: "skipped".to_string(),
            message: "Not installed — skipping.".to_string(),
          },
        );
        continue;
      }

      // Skip if already running
      if let Some(port) = def.port {
        if is_running_sync(port) {
          let _ = app.emit(
            "runtime://boot_status",
            RuntimeBootStatus {
              tool: def.name.to_string(),
              display_name: def.display_name.to_string(),
              status: "running".to_string(),
              message: format!("Already running on port {}.", port),
            },
          );
          continue;
        }
      }

      // Gap 8: emit starting status
      let _ = app.emit(
        "runtime://boot_status",
        RuntimeBootStatus {
          tool: def.name.to_string(),
          display_name: def.display_name.to_string(),
          status: "starting".to_string(),
          message: format!("Starting {}…", def.display_name),
        },
      );

      let exe = resolve_exe(def, &dir);
      let mut cmd = Command::new(&exe);
      cmd.args(def.args);
      if def.repo_url.is_some() || def.exe == "python" {
        cmd.current_dir(&dir);
      }
      cmd.stdout(std::process::Stdio::null());
      cmd.stderr(std::process::Stdio::null());
      no_window(&mut cmd);

      match cmd.spawn() {
        Ok(child) => {
          let pid = child.id();
          state.record_pid(def.name, pid);
          let _ = app.emit(
            "runtime://boot_status",
            RuntimeBootStatus {
              tool: def.name.to_string(),
              display_name: def.display_name.to_string(),
              status: "started".to_string(),
              message: format!("Started (PID {}).", pid),
            },
          );
          log::info!(
            "runtime_manager: auto-started {} PID={}",
            def.display_name,
            pid
          );
        }
        Err(e) => {
          let _ = app.emit(
            "runtime://boot_status",
            RuntimeBootStatus {
              tool: def.name.to_string(),
              display_name: def.display_name.to_string(),
              status: "failed".to_string(),
              message: format!("Failed to start: {}", e),
            },
          );
          log::error!(
            "runtime_manager: failed to start {}: {}",
            def.display_name,
            e
          );
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────
// Platform helpers
// ─────────────────────────────────────────────────────────

fn which_exe(name: &str) -> bool {
  let mut cmd = Command::new(if cfg!(target_os = "windows") {
    "where"
  } else {
    "which"
  });
  cmd
    .arg(name)
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null());
  no_window(&mut cmd);
  cmd.status().map(|s| s.success()).unwrap_or(false)
}

fn kill_pid(pid: u32) {
  if cfg!(target_os = "windows") {
    let mut cmd = Command::new("taskkill");
    cmd
      .args(["/PID", &pid.to_string(), "/T", "/F"])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null());
    no_window(&mut cmd);
    let _ = cmd.output();
  } else {
    let _ = Command::new("kill")
      .args(["-TERM", &pid.to_string()])
      .output();
  }
}

/// Check if a process with the given PID is still alive.
fn is_pid_alive(pid: u32) -> bool {
  if cfg!(target_os = "windows") {
    let mut cmd = Command::new("tasklist");
    cmd
      .args(["/FI", &format!("PID eq {}", pid), "/NH"])
      .stdout(std::process::Stdio::piped())
      .stderr(std::process::Stdio::null());
    no_window(&mut cmd);
    let output = cmd.output();
    match output {
      Ok(o) => {
        let out = String::from_utf8_lossy(&o.stdout);
        out.contains(&pid.to_string())
      }
      Err(_) => false,
    }
  } else {
    // kill -0 sends no signal but checks if process exists
    Command::new("kill")
      .args(["-0", &pid.to_string()])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .status()
      .map(|s| s.success())
      .unwrap_or(false)
  }
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn all_tools_have_unique_names() {
    let names: Vec<&str> = TOOLS.iter().map(|t| t.name).collect();
    let unique: std::collections::HashSet<&&str> = names.iter().collect();
    assert_eq!(names.len(), unique.len(), "duplicate tool names");
  }

  #[test]
  fn all_tools_have_unique_ports() {
    let ports: Vec<u16> = TOOLS.iter().filter_map(|t| t.port).collect();
    let unique: std::collections::HashSet<&u16> = ports.iter().collect();
    assert_eq!(ports.len(), unique.len(), "duplicate ports");
  }

  #[test]
  fn runtimes_dir_is_absolute() {
    assert!(runtimes_dir().is_absolute());
  }

  #[test]
  fn tool_def_lookup_works() {
    assert!(tool_def("ollama").is_some());
    assert!(tool_def("comfyui").is_some());
    assert!(tool_def("audiocraft").is_some());
    assert!(tool_def("openwebui").is_some());
    assert!(tool_def("nonexistent").is_none());
  }

  #[test]
  fn runtime_manager_pid_tracking() {
    let mgr = RuntimeManager::new();
    assert_eq!(mgr.spawned_pid("ollama"), None);
    mgr.record_pid("ollama", 1234);
    assert_eq!(mgr.spawned_pid("ollama"), Some(1234));
    mgr.remove_pid("ollama");
    assert_eq!(mgr.spawned_pid("ollama"), None);
  }

  #[test]
  fn autostart_prefs_defaults_ollama_only() {
    // Use an isolated, definitely-nonexistent path instead of the real
    // %APPDATA% prefs file — reading the real file (if the app has ever
    // actually run on this machine) made this test's "defaults" assumption
    // fail nondeterministically depending on the runner's disk state.
    let path = std::env::temp_dir().join(format!(
      "alphonso_test_autostart_prefs_{}.json",
      std::process::id()
    ));
    let prefs = load_autostart_prefs_from(&path);
    // Ollama defaults to true; others default to false
    assert_eq!(prefs.get("ollama").copied(), Some(true));
    assert_eq!(prefs.get("comfyui").copied(), Some(false));
    assert_eq!(prefs.get("whisper").copied(), Some(false));
  }

  #[test]
  fn audiocraft_args_use_file_not_module() {
    let def = tool_def("audiocraft").unwrap();
    // Gap 6: must be file path, not -m module syntax
    assert!(
      !def.args.contains(&"-m"),
      "audiocraft must not use -m module syntax"
    );
    assert!(
      def.args[0].ends_with(".py"),
      "audiocraft first arg must be a .py file"
    );
  }

  #[test]
  fn invokeai_exe_is_cli_name_not_python() {
    let def = tool_def("invokeai").unwrap();
    // Gap 7: invokeai should be resolved from venv, not run as python script
    assert_ne!(def.exe, "python");
    assert_eq!(def.exe, "invokeai-web");
  }

  #[test]
  fn venv_python_path_is_correct_for_platform() {
    let dir = PathBuf::from("/tmp/test");
    let vpy = venv_python(&dir);
    if cfg!(target_os = "windows") {
      assert!(vpy.to_string_lossy().contains("Scripts"));
    } else {
      assert!(vpy.to_string_lossy().contains("bin"));
    }
  }
}
