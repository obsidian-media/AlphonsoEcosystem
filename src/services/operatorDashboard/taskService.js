/**
 * Operator Dashboard Task Service
 * --------------------------------
 * This module aggregates a static list of project‑wide tasks and annotates each
 * with a status (`done`, `in-progress`, `pending`). The data is derived from
 * existing static task definitions in `projectExecutionService.js` and a few
 * hard‑coded completions for demonstration purposes.
 *
 * The service is deliberately lightweight – it does not perform any I/O or
 * async operations because the source information lives entirely in memory.
 * It returns an array of objects suitable for rendering in the Operator
 * Dashboard UI.
 */

// Import the static task definitions. The file exports an object keyed by
// agent name where each entry is an array of task titles.
import projectExecutionService from "../projectExecution/projectExecutionService";

/**
 * Hard‑coded status maps.
 * In a real implementation these would be persisted in a database or derived
 * from workflow telemetry. For now we simply define a small set to make the UI
 * useful without building additional infrastructure.
 */
const completedTasks = new Set([
  // Tasks that have already been shipped in the prototype
  "implementation plan",
  "local setup plan",
  "build/test verification checklist",
]);

const inProgressTasks = new Set([
  "dashboard ui",
  "connector health",
  "memory dashboard",
]);

/**
 * Helper – normalises a task title for comparison.
 */
function normalise(title) {
  return title.trim().toLowerCase();
}

/**
 * Build the unified task list.
 * Each entry contains:
 *   - title: human readable name
 *   - description: optional short description (empty for now)
 *   - status: one of "done", "in-progress", "pending"
 *   - componentPath: optional lazy‑load route for linking to the UI component
 */
export function getOperatorDashboardTasks() {
  const tasks = [];

  // Extract the static per‑agent task arrays from the execution service.
  // The service exports an object where the keys are agent names and the values
  // are arrays of task strings.
  const perAgent = projectExecutionService?.agentTaskMap || {};

  for (const [agent, list] of Object.entries(perAgent)) {
    if (!Array.isArray(list)) continue;
    list.forEach((rawTitle) => {
      const title = rawTitle;
      const key = normalise(title);
      let status = "pending";
      if (completedTasks.has(key)) status = "done";
      else if (inProgressTasks.has(key)) status = "in-progress";

      // Optional mapping to a component path – this allows the UI to render a
      // clickable link that lazily loads the target panel. The mapping is kept
      // simple; if a component does not exist we omit the field.
      const componentPathMap = {
        "dashboard ui": "./components/OperatorDashboard",
        "connector health": "./components/ConnectorHealthPanel",
        "memory dashboard": "./components/MemoryDashboard",
      };
      const componentPath = componentPathMap[key] || null;

      tasks.push({
        title,
        description: "",
        status,
        componentPath,
        agent,
      });
    });
  }

  // Sort by status order for deterministic UI rendering.
  const order = { done: 0, "in-progress": 1, pending: 2 };
  return tasks.sort((a, b) => order[a.status] - order[b.status]);
}
