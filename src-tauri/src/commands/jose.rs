use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JoseAssignmentProof {
  agent: String,
  title: String,
  rationale: String,
  action_type: String,
  risk_level: String,
  requires_approval: bool,
  command_preview: String,
  decomposition: Vec<String>,
}

#[tauri::command]
pub(crate) fn decompose_jose_command_backend(command_text: String) -> Vec<JoseAssignmentProof> {
  let clean = command_text.trim().to_string();
  if clean.is_empty() {
    return vec![];
  }
  let lower = clean.to_ascii_lowercase();
  let fragments = split_command_fragments(&lower);
  let mut assignments: Vec<JoseAssignmentProof> = vec![];

  let research = text_has_any(
    &lower,
    &[
      "research", "lookup", "docs", "source", "citation", "latest", "pricing", "market",
    ],
  );
  let creative = text_has_any(
    &lower,
    &[
      "video",
      "script",
      "brand",
      "campaign",
      "thumbnail",
      "storyboard",
      "prompt",
      "creative",
    ],
  );
  let local_execution = text_has_any(
    &lower,
    &[
      "build",
      "runtime",
      "ollama",
      "verify",
      "diagnostic",
      "fix",
      "test",
      "package",
      "file",
    ],
  );
  let publishing = text_has_any(
    &lower,
    &[
      "upload",
      "publish",
      "post",
      "youtube",
      "tiktok",
      "instagram",
    ],
  );
  let risky_local = text_has_any(
    &lower,
    &["delete", "remove", "deploy", "write", "modify", "execute"],
  );

  if research {
    assignments.push(JoseAssignmentProof {
      agent: "hector".to_string(),
      title: format!(
        "Hector research task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Research language detected. Hector should gather and verify sources.".to_string(),
      action_type: "research".to_string(),
      risk_level: "low".to_string(),
      requires_approval: true,
      command_preview: "Research and citation proof only. No uploads or account actions."
        .to_string(),
      decomposition: fragments.clone(),
    });
  }

  if publishing {
    assignments.push(JoseAssignmentProof {
      agent: "hector".to_string(),
      title: format!(
        "Hector publish safety check: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Publishing language detected. Jose approval required before any external action."
        .to_string(),
      action_type: "external_publish_handoff".to_string(),
      risk_level: "high".to_string(),
      requires_approval: true,
      command_preview: "No automatic posting. Requires explicit approval and connector auth."
        .to_string(),
      decomposition: fragments.clone(),
    });
  }

  if creative {
    assignments.push(JoseAssignmentProof {
      agent: "miya".to_string(),
      title: format!(
        "Miya creative task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Creative language detected. Miya produces script/storyboard/prompt packages."
        .to_string(),
      action_type: "creative_package".to_string(),
      risk_level: "low".to_string(),
      requires_approval: true,
      command_preview: "Creative package generation only.".to_string(),
      decomposition: fragments.clone(),
    });
  }

  if local_execution {
    assignments.push(JoseAssignmentProof {
      agent: "alphonso".to_string(),
      title: format!(
        "Alphonso operator task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "Runtime/build/verification language detected.".to_string(),
      action_type: "local_operation".to_string(),
      risk_level: if risky_local {
        "high".to_string()
      } else {
        "medium".to_string()
      },
      requires_approval: true,
      command_preview: if risky_local {
        "Potential local/system action. Explicit approval required.".to_string()
      } else {
        "Local diagnostics/verification only.".to_string()
      },
      decomposition: fragments.clone(),
    });
  }

  if assignments.is_empty() {
    assignments.push(JoseAssignmentProof {
      agent: "jose".to_string(),
      title: format!(
        "Jose planning task: {}",
        clean.chars().take(64).collect::<String>()
      ),
      rationale: "No specialist match detected.".to_string(),
      action_type: "orchestration_review".to_string(),
      risk_level: "low".to_string(),
      requires_approval: false,
      command_preview: "Planning only.".to_string(),
      decomposition: fragments,
    });
  }

  assignments
}

fn text_has_any(text: &str, terms: &[&str]) -> bool {
  terms.iter().any(|term| text.contains(term))
}

fn split_command_fragments(input: &str) -> Vec<String> {
  input
    .split([',', '.'])
    .flat_map(|part| part.split(" then "))
    .flat_map(|part| part.split(" and "))
    .map(|part| part.trim().to_string())
    .filter(|part| !part.is_empty())
    .take(10)
    .collect()
}
