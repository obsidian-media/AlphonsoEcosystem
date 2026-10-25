//! The text of the pages Hector read (agent phase 1, 2026-10-25): one file per
//! source in `<app data>/research/<reportId>/<n>.txt`. Until then every report
//! kept up to 200 KB per page in app storage, which filled after 15-20 runs.
//! The report in app storage keeps titles, links, labels and short excerpts.
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_PAGE_BYTES: usize = 200 * 1024;
const MAX_PAGES: u32 = 64;

#[derive(Deserialize)]
pub(crate) struct ResearchPage {
  n: u32,
  text: String,
}

/// `hector-report-` then letters, digits and dashes (at most 64): no folders or dots.
pub(crate) fn valid_report_id(id: &str) -> Result<(), String> {
  let rest = id
    .strip_prefix("hector-report-")
    .ok_or_else(|| "Not a research report id.".to_string())?;
  let ok = !rest.is_empty()
    && rest.len() <= 64
    && rest
      .chars()
      .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
  if ok {
    Ok(())
  } else {
    Err("Not a research report id.".to_string())
  }
}

fn valid_page(n: u32) -> Result<(), String> {
  if (1..=MAX_PAGES).contains(&n) {
    Ok(())
  } else {
    Err(format!("A page number must be between 1 and {MAX_PAGES}."))
  }
}

fn cut(text: &str) -> &str {
  if text.len() <= MAX_PAGE_BYTES {
    return text;
  }
  let mut end = MAX_PAGE_BYTES;
  while !text.is_char_boundary(end) {
    end -= 1;
  }
  &text[..end]
}

pub(crate) fn save_in(root: &Path, report_id: &str, pages: &[ResearchPage]) -> Result<(), String> {
  valid_report_id(report_id)?;
  let dir = root.join(report_id);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  for page in pages {
    valid_page(page.n)?;
    let target = dir.join(format!("{}.txt", page.n));
    let part = dir.join(format!("{}.txt.part", page.n));
    fs::write(&part, cut(&page.text)).map_err(|e| e.to_string())?;
    fs::rename(&part, &target).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub(crate) fn read_in(root: &Path, report_id: &str, n: u32) -> Result<String, String> {
  valid_report_id(report_id)?;
  valid_page(n)?;
  fs::read_to_string(root.join(report_id).join(format!("{n}.txt")))
    .map_err(|_| "That page was not saved.".to_string())
}

pub(crate) fn delete_in(root: &Path, report_id: &str) -> Result<(), String> {
  valid_report_id(report_id)?;
  match fs::remove_dir_all(root.join(report_id)) {
    Ok(()) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

fn research_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  crate::app_data_subdir(app, "research")
}

#[tauri::command]
pub(crate) fn research_save_pages(
  app: tauri::AppHandle,
  report_id: String,
  pages: Vec<ResearchPage>,
) -> Result<(), String> {
  save_in(&research_root(&app)?, &report_id, &pages)
}

#[tauri::command]
pub(crate) fn research_read_page(
  app: tauri::AppHandle,
  report_id: String,
  n: u32,
) -> Result<String, String> {
  read_in(&research_root(&app)?, &report_id, n)
}

#[tauri::command]
pub(crate) fn research_delete(app: tauri::AppHandle, report_id: String) -> Result<(), String> {
  delete_in(&research_root(&app)?, &report_id)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("alphonso-research-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn report_id_with_path_characters_is_refused() {
    for bad in [
      "../x",
      "hector-report-../x",
      "hector-report-a/b",
      "hector-report-A",
      "hector-report-",
      "other-1",
    ] {
      assert!(valid_report_id(bad).is_err(), "{bad} should be refused");
    }
    assert!(valid_report_id("hector-report-1792914719813-1aca93").is_ok());
  }

  #[test]
  fn pages_round_trip_and_delete() {
    let root = temp_root("pages");
    let id = "hector-report-1-abc";
    save_in(
      &root,
      id,
      &[
        ResearchPage {
          n: 1,
          text: "first page".into(),
        },
        ResearchPage {
          n: 2,
          text: "second".into(),
        },
      ],
    )
    .unwrap();
    assert_eq!(read_in(&root, id, 2).unwrap(), "second");
    assert!(read_in(&root, id, 3).is_err());
    delete_in(&root, id).unwrap();
    assert!(read_in(&root, id, 1).is_err());
    delete_in(&root, id).unwrap();
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn a_long_page_is_cut_and_a_bad_number_refused() {
    let root = temp_root("long");
    let id = "hector-report-2-abc";
    save_in(
      &root,
      id,
      &[ResearchPage {
        n: 1,
        text: "é".repeat(150_000),
      }],
    )
    .unwrap();
    assert!(read_in(&root, id, 1).unwrap().len() <= MAX_PAGE_BYTES);
    assert!(save_in(
      &root,
      id,
      &[ResearchPage {
        n: 0,
        text: "x".into()
      }]
    )
    .is_err());
    let _ = fs::remove_dir_all(&root);
  }
}
