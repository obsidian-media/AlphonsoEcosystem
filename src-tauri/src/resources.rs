//! Memory on this computer, for the resource manager (2026-10-30): free and
//! total RAM, the graphics card's memory when an NVIDIA card answers, and the
//! memory of each tool Alphonso started (from `RuntimeManager`'s own list, the
//! one record of "Alphonso started it"). Graphics memory from ComfyUI or
//! Ollama is read on the app side; this command never guesses it.

use serde::Serialize;

const MIB: u64 = 1_048_576;

pub(crate) fn mb(bytes: u64) -> u64 {
  bytes / MIB
}

/// (total, free) MiB of the first card from
/// `nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits`.
pub(crate) fn parse_gpu_usage(output: &str) -> Option<(u64, u64)> {
  let line = output.lines().find(|l| !l.trim().is_empty())?;
  let mut parts = line.split(',').map(str::trim);
  let total = parts.next()?.parse().ok()?;
  let free = parts.next()?.parse().ok()?;
  Some((total, free))
}

/// Memory of `root` and every process below it, from (pid, parent, bytes).
pub(crate) fn tree_memory(root: u32, procs: &[(u32, Option<u32>, u64)]) -> u64 {
  if !procs.iter().any(|(pid, _, _)| *pid == root) {
    return 0;
  }
  let mut total = 0;
  let mut stack = vec![root];
  let mut seen = std::collections::HashSet::new();
  while let Some(pid) = stack.pop() {
    if !seen.insert(pid) {
      continue;
    }
    for (p, parent, bytes) in procs {
      if *p == pid {
        total += bytes;
      }
      if *parent == Some(pid) {
        stack.push(*p);
      }
    }
  }
  total
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GpuReading {
  total_mb: u64,
  free_mb: u64,
  source: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolMemory {
  tool: String,
  pid: u32,
  mem_mb: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResourceSnapshot {
  ram_total_mb: u64,
  ram_free_mb: u64,
  gpu: Option<GpuReading>,
  processes: Vec<ToolMemory>,
}

/// The NVIDIA card's total and free memory, or None (no card, or no answer in 5 s).
async fn nvidia_usage() -> Option<(u64, u64)> {
  let mut cmd = tokio::process::Command::new("nvidia-smi");
  cmd
    .args([
      "--query-gpu=memory.total,memory.free",
      "--format=csv,noheader,nounits",
    ])
    .kill_on_drop(true);
  crate::utils::no_window_async(&mut cmd);
  let output = tokio::time::timeout(std::time::Duration::from_secs(5), cmd.output())
    .await
    .ok()?
    .ok()?;
  if !output.status.success() {
    return None;
  }
  parse_gpu_usage(&String::from_utf8_lossy(&output.stdout))
}

/// RAM, the tools Alphonso started that are still alive with their memory
/// (child processes included), and the NVIDIA card when there is one.
#[tauri::command]
pub(crate) async fn resource_snapshot(
  state: tauri::State<'_, crate::runtime_manager::RuntimeManager>,
) -> Result<ResourceSnapshot, String> {
  use sysinfo::{MemoryRefreshKind, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
  let started = state.spawned_pids();
  let (ram_total_mb, ram_free_mb, processes) = tokio::task::spawn_blocking(move || {
    let mut sys = System::new_with_specifics(
      RefreshKind::nothing().with_memory(MemoryRefreshKind::nothing().with_ram()),
    );
    sys.refresh_processes_specifics(
      ProcessesToUpdate::All,
      true,
      ProcessRefreshKind::nothing().with_memory(),
    );
    let procs: Vec<(u32, Option<u32>, u64)> = sys
      .processes()
      .iter()
      .map(|(pid, p)| (pid.as_u32(), p.parent().map(|pp| pp.as_u32()), p.memory()))
      .collect();
    let processes: Vec<ToolMemory> = started
      .into_iter()
      .filter(|(_, pid)| procs.iter().any(|(p, _, _)| p == pid))
      .map(|(tool, pid)| ToolMemory {
        tool,
        pid,
        mem_mb: mb(tree_memory(pid, &procs)),
      })
      .collect();
    (
      mb(sys.total_memory()),
      mb(sys.available_memory()),
      processes,
    )
  })
  .await
  .map_err(|e| e.to_string())?;
  let gpu = nvidia_usage().await.map(|(total_mb, free_mb)| GpuReading {
    total_mb,
    free_mb,
    source: "nvidia",
  });
  Ok(ResourceSnapshot {
    ram_total_mb,
    ram_free_mb,
    gpu,
    processes,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_tool_counts_its_child_processes() {
    // ollama serve (10) runs a model runner (11), which runs a helper (12);
    // 20 is unrelated.
    let procs = [
      (10, None, 100),
      (11, Some(10), 3000),
      (12, Some(11), 50),
      (20, None, 999),
    ];
    assert_eq!(tree_memory(10, &procs), 3150);
    assert_eq!(tree_memory(11, &procs), 3050);
    assert_eq!(tree_memory(42, &procs), 0);
  }

  #[test]
  fn reads_total_and_free_graphics_memory() {
    assert_eq!(parse_gpu_usage("8192, 6000\n"), Some((8192, 6000)));
    assert_eq!(
      parse_gpu_usage("\n 4096 , 512 \n 8192, 100\n"),
      Some((4096, 512))
    );
  }

  #[test]
  fn no_reading_when_nvidia_smi_says_nothing_useful() {
    assert_eq!(parse_gpu_usage(""), None);
    assert_eq!(parse_gpu_usage("N/A, N/A"), None);
    assert_eq!(parse_gpu_usage("8192"), None);
  }

  #[test]
  fn megabytes_round_down() {
    assert_eq!(mb(0), 0);
    assert_eq!(mb(1_048_575), 0);
    assert_eq!(mb(3 * 1_048_576 + 5), 3);
  }
}
