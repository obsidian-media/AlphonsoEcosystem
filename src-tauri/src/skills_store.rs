//! Your own agent skills (agent roles Part B, 2026-10-25): Markdown files in
//! `<app data>/skills/<agent>/<name>.md`. The app checks what a skill may do;
//! this module only keeps the files, and refuses any agent or file name that
//! could reach outside the skills folder.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// The agents that have skills. Jose plans; he has none.
const SKILL_AGENTS: [&str; 8] = [
  "alphonso", "miya", "hector", "nova", "maria", "sentinel", "marcus", "echo",
];
const MAX_SKILL_BYTES: u64 = 64 * 1024;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserSkillFile {
  agent: String,
  file: String,
  text: String,
  too_large: bool,
}

pub(crate) fn valid_agent(agent: &str) -> Result<(), String> {
  if SKILL_AGENTS.contains(&agent) {
    Ok(())
  } else {
    Err(format!("There is no agent with skills called \"{agent}\"."))
  }
}

/// `[a-z0-9-]{1,64}.md` only: no folders, dots, drive letters or spaces.
pub(crate) fn valid_file(file: &str) -> Result<(), String> {
  let stem = file
    .strip_suffix(".md")
    .ok_or_else(|| "A skill file name must end in .md.".to_string())?;
  let ok = !stem.is_empty()
    && stem.len() <= 64
    && stem
      .chars()
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
  if ok {
    Ok(())
  } else {
    Err("A skill file name may use only small letters, digits and dashes.".to_string())
  }
}

fn skills_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  crate::app_data_subdir(app, "skills")
}

pub(crate) fn list_in(root: &Path) -> Vec<UserSkillFile> {
  let mut out = Vec::new();
  for agent in SKILL_AGENTS {
    let dir = root.join(agent);
    let Ok(entries) = fs::read_dir(&dir) else {
      continue;
    };
    let mut files: Vec<(String, PathBuf)> = entries
      .flatten()
      .filter_map(|entry| {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        (is_file && valid_file(&name).is_ok()).then(|| (name, entry.path()))
      })
      .collect();
    files.sort();
    for (file, path) in files {
      let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
      let too_large = size > MAX_SKILL_BYTES;
      let text = if too_large {
        String::new()
      } else {
        fs::read_to_string(&path).unwrap_or_default()
      };
      out.push(UserSkillFile {
        agent: agent.to_string(),
        file,
        text,
        too_large,
      });
    }
  }
  out
}

pub(crate) fn save_in(root: &Path, agent: &str, file: &str, text: &str) -> Result<(), String> {
  valid_agent(agent)?;
  valid_file(file)?;
  if text.len() as u64 > MAX_SKILL_BYTES {
    return Err("The skill file is larger than 64 KB.".to_string());
  }
  let dir = root.join(agent);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let target = dir.join(file);
  let part = dir.join(format!("{file}.part"));
  fs::write(&part, text).map_err(|e| e.to_string())?;
  fs::rename(&part, &target).map_err(|e| e.to_string())
}

pub(crate) fn delete_in(root: &Path, agent: &str, file: &str) -> Result<(), String> {
  valid_agent(agent)?;
  valid_file(file)?;
  let target = root.join(agent).join(file);
  match fs::remove_file(&target) {
    Ok(()) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub(crate) fn skills_list_user(app: tauri::AppHandle) -> Result<Vec<UserSkillFile>, String> {
  Ok(list_in(&skills_root(&app)?))
}

#[tauri::command]
pub(crate) fn skills_save_user(
  app: tauri::AppHandle,
  agent: String,
  file: String,
  text: String,
) -> Result<(), String> {
  save_in(&skills_root(&app)?, &agent, &file, &text)
}

#[tauri::command]
pub(crate) fn skills_delete_user(
  app: tauri::AppHandle,
  agent: String,
  file: String,
) -> Result<(), String> {
  delete_in(&skills_root(&app)?, &agent, &file)
}

/// A skill file chosen in a dialog the backend opens; the window never gives a path.
#[tauri::command]
pub(crate) async fn skills_import_user(app: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  let Some(picked) = app
    .dialog()
    .file()
    .add_filter("Skill files", &["md"])
    .blocking_pick_file()
  else {
    return Ok(None);
  };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
  if size > MAX_SKILL_BYTES {
    return Err("The skill file is larger than 64 KB.".to_string());
  }
  fs::read_to_string(&path)
    .map(Some)
    .map_err(|_| "The file is not text.".to_string())
}

#[tauri::command]
pub(crate) fn skills_open_folder(app: tauri::AppHandle) -> Result<String, String> {
  use tauri_plugin_opener::OpenerExt;
  let root = skills_root(&app)?;
  for agent in SKILL_AGENTS {
    let _ = fs::create_dir_all(root.join(agent));
  }
  let shown = root.to_string_lossy().to_string();
  app
    .opener()
    .open_path(shown.clone(), None::<&str>)
    .map_err(|e| e.to_string())?;
  Ok(shown)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("alphonso-skills-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn refuses_paths_in_file_names() {
    for bad in [
      "../x.md", "a\\b.md", "c:x.md", "a/b.md", "Big.md", ".md", "x.txt", "x.md.md", "a b.md",
    ] {
      assert!(valid_file(bad).is_err(), "{bad} should be refused");
    }
    assert!(valid_file("claim-check-2.md").is_ok());
  }

  #[test]
  fn refuses_an_agent_without_skills() {
    assert!(valid_agent("jose").is_err());
    assert!(valid_agent("../maria").is_err());
    assert!(valid_agent("maria").is_ok());
  }

  #[test]
  fn save_then_list_returns_the_text() {
    let root = temp_root("save");
    save_in(
      &root,
      "maria",
      "claim-check.md",
      "---\nname: Claim check\n---\nCheck.",
    )
    .unwrap();
    let listed = list_in(&root);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].agent, "maria");
    assert_eq!(listed[0].file, "claim-check.md");
    assert!(listed[0].text.contains("Claim check"));
    assert!(!root.join("maria").join("claim-check.md.part").exists());
    delete_in(&root, "maria", "claim-check.md").unwrap();
    assert!(list_in(&root).is_empty());
    delete_in(&root, "maria", "claim-check.md").unwrap();
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn lists_only_md_files_and_marks_large_ones() {
    let root = temp_root("list");
    let dir = root.join("hector");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("notes.txt"), "x").unwrap();
    fs::write(dir.join("Bad Name.md"), "x").unwrap();
    fs::write(dir.join("big.md"), "x".repeat(70 * 1024)).unwrap();
    fs::write(dir.join("ok.md"), "fine").unwrap();
    let listed = list_in(&root);
    let names: Vec<_> = listed.iter().map(|f| f.file.as_str()).collect();
    assert_eq!(names, vec!["big.md", "ok.md"]);
    assert!(listed[0].too_large && listed[0].text.is_empty());
    assert!(!listed[1].too_large);
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn refuses_a_file_over_64_kb_on_save() {
    let root = temp_root("big");
    assert!(save_in(&root, "nova", "x.md", &"y".repeat(70 * 1024)).is_err());
    let _ = fs::remove_dir_all(&root);
  }
}
