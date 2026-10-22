//! Finds ComfyUI installs on this machine, and the Python each one uses.
//!
//! Runtime Hub used to count ComfyUI as installed only if Alphonso had cloned
//! its own copy, and Settings searched a few fixed folders from one developer's
//! machine. A user with their own ComfyUI saw "not installed" and was offered a
//! second copy (QA Bug 31, 2026-10-22). Nothing here is machine-specific: an
//! install is found because it is running, because the user chose it in
//! Settings, because Alphonso installed it, or because it is in a usual place.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyUiInstall {
  /// The folder that holds ComfyUI's `main.py`.
  pub path: String,
  /// The Python that runs it, when one was found.
  pub python: Option<String>,
  /// True when a ComfyUI is running from this folder now.
  pub running: bool,
  /// How it was found: "settings", "running", "alphonso", "usual-place".
  pub sources: Vec<String>,
  /// Image models in its `models/checkpoints` folder.
  pub checkpoints: u32,
  /// Alphonso's own copy (Runtime Hub's install).
  pub alphonso_copy: bool,
}

/// A ComfyUI folder has `main.py` and the `comfy` package next to it.
pub(crate) fn is_comfyui_root(dir: &Path) -> bool {
  dir.join("main.py").is_file() && dir.join("comfy").is_dir()
}

/// `dir` itself, or its `ComfyUI` subfolder (the portable build and the
/// Desktop app both nest it), when that is a ComfyUI folder.
pub(crate) fn normalize_root(dir: &Path) -> Option<PathBuf> {
  if is_comfyui_root(dir) {
    return Some(dir.to_path_buf());
  }
  let nested = dir.join("ComfyUI");
  is_comfyui_root(&nested).then_some(nested)
}

fn venv_python(venv: &Path) -> PathBuf {
  if cfg!(target_os = "windows") {
    venv.join("Scripts").join("python.exe")
  } else {
    venv.join("bin").join("python3")
  }
}

/// The Python next to a ComfyUI folder: its own `.venv` or `venv`, a `venv`
/// beside it, or the portable build's `python_embeded`.
pub(crate) fn python_for_root(root: &Path) -> Option<PathBuf> {
  let mut options = vec![
    venv_python(&root.join(".venv")),
    venv_python(&root.join("venv")),
  ];
  if let Some(parent) = root.parent() {
    options.push(venv_python(&parent.join("venv")));
    options.push(venv_python(&parent.join(".venv")));
    let embedded = if cfg!(target_os = "windows") {
      "python.exe"
    } else {
      "python3"
    };
    options.push(parent.join("python_embeded").join(embedded));
  }
  options.into_iter().find(|p| p.is_file())
}

pub(crate) fn count_checkpoints(root: &Path) -> u32 {
  let Ok(entries) = std::fs::read_dir(root.join("models").join("checkpoints")) else {
    return 0;
  };
  entries
    .flatten()
    .filter(|e| {
      let name = e.file_name().to_string_lossy().to_lowercase();
      name.ends_with(".safetensors") || name.ends_with(".ckpt")
    })
    .count() as u32
}

/// The ComfyUI folder a process runs from, given its command line and working
/// folder: the folder of a `main.py` argument, else the working folder.
pub(crate) fn root_from_process(cmd: &[String], cwd: Option<&Path>) -> Option<PathBuf> {
  let main = cmd.iter().find(|a| {
    let lower = a.to_lowercase();
    lower == "main.py" || lower.ends_with("/main.py") || lower.ends_with("\\main.py")
  })?;
  let main_path = Path::new(main);
  let dir = if main_path.is_absolute() {
    main_path.parent()?.to_path_buf()
  } else {
    cwd?.join(main_path).parent()?.to_path_buf()
  };
  is_comfyui_root(&dir).then_some(dir)
}

/// Running ComfyUIs: (folder, the Python running it).
fn running_installs() -> Vec<(PathBuf, Option<PathBuf>)> {
  use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
  let mut sys = System::new();
  sys.refresh_processes_specifics(
    ProcessesToUpdate::All,
    true,
    ProcessRefreshKind::everything(),
  );
  sys
    .processes()
    .values()
    .filter_map(|p| {
      let cmd: Vec<String> = p
        .cmd()
        .iter()
        .map(|a| a.to_string_lossy().to_string())
        .collect();
      let root = root_from_process(&cmd, p.cwd())?;
      Some((root, p.exe().map(Path::to_path_buf)))
    })
    .collect()
}

/// The usual places ComfyUI ends up, for this user and machine.
fn usual_places() -> Vec<PathBuf> {
  let mut out = Vec::new();
  let home = std::env::var("USERPROFILE")
    .or_else(|_| std::env::var("HOME"))
    .unwrap_or_default();
  if !home.is_empty() {
    let home = PathBuf::from(home);
    out.push(home.join("Documents").join("ComfyUI"));
    out.push(home.join("ComfyUI"));
    out.push(home.join("ComfyUI_windows_portable"));
    out.push(home.join("Desktop").join("ComfyUI_windows_portable"));
  }
  // The ComfyUI Desktop app records where it installed ComfyUI.
  if let Ok(appdata) = std::env::var("APPDATA") {
    let config = PathBuf::from(appdata).join("ComfyUI").join("config.json");
    if let Ok(text) = std::fs::read_to_string(config) {
      if let Some(base) = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| {
          v.get("basePath")
            .and_then(|b| b.as_str())
            .map(PathBuf::from)
        })
      {
        out.push(base);
      }
    }
  }
  if cfg!(target_os = "windows") {
    for letter in b'C'..=b'Z' {
      let drive = PathBuf::from(format!("{}:\\", letter as char));
      if drive.exists() {
        out.push(drive.join("ComfyUI"));
        out.push(drive.join("ComfyUI_windows_portable"));
      }
    }
  }
  out
}

/// Sort: the folder chosen in Settings, then running, then Alphonso's copy,
/// then the one with the most image models.
pub(crate) fn sort_installs(installs: &mut [ComfyUiInstall]) {
  installs.sort_by_key(|i| {
    (
      !i.sources.iter().any(|s| s == "settings"),
      !i.running,
      !i.alphonso_copy,
      std::cmp::Reverse(i.checkpoints),
    )
  });
}

fn key(path: &Path) -> String {
  path
    .to_string_lossy()
    .to_lowercase()
    .trim_end_matches(['\\', '/'])
    .to_string()
}

#[tauri::command]
pub fn comfyui_find_installs(saved_dir: Option<String>) -> Vec<ComfyUiInstall> {
  let mut found: Vec<ComfyUiInstall> = Vec::new();
  let mut add =
    |root: PathBuf, source: &str, python: Option<PathBuf>, running: bool, alphonso: bool| {
      if let Some(existing) = found
        .iter_mut()
        .find(|i| key(Path::new(&i.path)) == key(&root))
      {
        if !existing.sources.iter().any(|s| s == source) {
          existing.sources.push(source.to_string());
        }
        existing.running |= running;
        existing.alphonso_copy |= alphonso;
        if existing.python.is_none() {
          existing.python = python.map(|p| p.to_string_lossy().to_string());
        }
        return;
      }
      // The Python beside the install comes first: on Windows a venv's
      // python.exe starts the base Python, so a running ComfyUI's process
      // shows the base interpreter, which lacks ComfyUI's packages.
      let python = python_for_root(&root).or(python);
      found.push(ComfyUiInstall {
        path: root.to_string_lossy().to_string(),
        python: python.map(|p| p.to_string_lossy().to_string()),
        running,
        sources: vec![source.to_string()],
        checkpoints: count_checkpoints(&root),
        alphonso_copy: alphonso,
      });
    };

  for (root, python) in running_installs() {
    add(root, "running", python, true, false);
  }
  if let Some(saved) = saved_dir
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    if let Some(root) = normalize_root(Path::new(saved)) {
      add(root, "settings", None, false, false);
    }
  }
  let own = crate::runtime_manager::runtimes_dir().join("comfyui");
  if let Some(root) = normalize_root(&own) {
    add(root, "alphonso", None, false, true);
  }
  for place in usual_places() {
    if let Some(root) = normalize_root(&place) {
      add(root, "usual-place", None, false, false);
    }
  }
  sort_installs(&mut found);
  found
}

#[cfg(test)]
mod tests {
  use super::*;

  fn make_root(base: &Path) -> PathBuf {
    std::fs::create_dir_all(base.join("comfy")).unwrap();
    std::fs::write(base.join("main.py"), b"").unwrap();
    base.to_path_buf()
  }

  fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("alphonso-comfy-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn recognises_a_comfyui_folder_and_its_nested_form() {
    let base = temp("nested");
    assert!(normalize_root(&base).is_none());
    let nested = make_root(&base.join("ComfyUI"));
    assert_eq!(normalize_root(&base), Some(nested.clone()));
    assert_eq!(normalize_root(&nested), Some(nested));
    let _ = std::fs::remove_dir_all(&base);
  }

  #[test]
  fn finds_the_python_beside_the_folder() {
    let base = temp("python");
    let root = make_root(&base.join("ComfyUI"));
    assert!(python_for_root(&root).is_none());
    let py = venv_python(&base.join("venv"));
    std::fs::create_dir_all(py.parent().unwrap()).unwrap();
    std::fs::write(&py, b"").unwrap();
    assert_eq!(python_for_root(&root), Some(py));
    let _ = std::fs::remove_dir_all(&base);
  }

  #[test]
  fn reads_the_folder_from_a_running_process() {
    let base = temp("process");
    let root = make_root(&base);
    let abs = vec![
      "python.exe".to_string(),
      root.join("main.py").to_string_lossy().to_string(),
      "--port".into(),
      "8188".into(),
    ];
    assert_eq!(root_from_process(&abs, None), Some(root.clone()));
    let rel = vec!["python".to_string(), "main.py".to_string()];
    assert_eq!(root_from_process(&rel, Some(&root)), Some(root.clone()));
    // Some other main.py is not a ComfyUI.
    let other = temp("other");
    assert_eq!(root_from_process(&rel, Some(&other)), None);
    assert_eq!(
      root_from_process(&["node".to_string(), "server.js".to_string()], Some(&root)),
      None
    );
    let _ = std::fs::remove_dir_all(&base);
    let _ = std::fs::remove_dir_all(&other);
  }

  #[test]
  fn puts_the_chosen_then_the_running_install_first() {
    let mk = |path: &str, sources: &[&str], running: bool, checkpoints: u32| ComfyUiInstall {
      path: path.into(),
      python: None,
      running,
      sources: sources.iter().map(|s| s.to_string()).collect(),
      checkpoints,
      alphonso_copy: false,
    };
    let mut list = vec![
      mk("a", &["usual-place"], false, 9),
      mk("b", &["running"], true, 1),
      mk("c", &["settings"], false, 0),
    ];
    sort_installs(&mut list);
    assert_eq!(
      list.iter().map(|i| i.path.as_str()).collect::<Vec<_>>(),
      vec!["c", "b", "a"]
    );
  }
}
