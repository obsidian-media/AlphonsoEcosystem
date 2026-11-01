# Workflow Node Reference

Alphonso's visual workflow builder (`WorkflowBuilderView`) supports 9 node types organized into categories.

## Node Types

### flow

#### `trigger`
**Label:** Trigger  
**Description:** The entry point of a workflow. Defines what event starts execution — a manual command, a schedule, or an external webhook.  
**Inputs:** none (always first node)  
**Outputs:** → next node  
**Example:** Start a content campaign when a scheduled calendar event fires.

---

### intelligence

#### `ocr`
**Label:** OCR Check  
**Description:** Runs optical character recognition on an attached image or document to extract text for downstream processing.  
**Inputs:** image or document reference  
**Outputs:** extracted text string → next node  
**Example:** Extract invoice amounts from scanned PDFs before feeding into an approval gate.

#### `memory`
**Label:** Memory Link  
**Description:** Reads from or writes to Alphonso's unified memory (via `unifiedMemoryService`). Use to inject prior context or persist workflow outputs.  
**Inputs:** namespace key, read/write mode  
**Outputs:** memory value (read mode) or confirmation (write mode)  
**Example:** Retrieve last week's Nova opportunity score to compare against today's scan.

---

### ai

#### `analysis`
**Label:** AI Analysis  
**Description:** Sends a prompt and context to the active Ollama model and returns a structured analysis result. Core intelligence step in most workflows.  
**Inputs:** prompt template, context variables  
**Outputs:** AI response text → next node  
**Example:** Analyze a competitor's recent GitHub releases to surface threats for Sentinel.

---

### logic

#### `condition`
**Label:** Condition  
**Description:** Branches the workflow based on a boolean expression evaluated against the current context (e.g., `score > 70`, `status === 'error'`).  
**Inputs:** condition expression, true/false branches  
**Outputs:** → true branch node, → false branch node  
**Example:** Route high-risk items (Maria score > 70) to a human approval gate, low-risk items directly to distribution.

---

### control

#### `approval`
**Label:** Approval Gate  
**Description:** Pauses workflow execution and waits for explicit human approval via the `ApprovalModal`. Supports risk levels (low/medium/high/critical). Integrates with `policyEnforcementService`.  
**Inputs:** action description, risk level  
**Outputs:** → approved branch, → rejected branch  
**Example:** Require a human to confirm before Marcus publishes content to Slack.

---

### execution

#### `action`
**Label:** Action  
**Description:** Executes a connector operation (Telegram send, GitHub issue create, Slack post, etc.) or calls an agent service. The primary side-effect node.  
**Inputs:** connector id, operation name, parameters  
**Outputs:** operation result → next node  
**Example:** Post the daily briefing summary to a Telegram channel.

---

### reporting

#### `notification`
**Label:** Notification  
**Description:** Dispatches an in-app toast or activity log entry without triggering a full connector action. Lightweight status update within the Alphonso shell.  
**Inputs:** message, type (info/success/warning/error)  
**Outputs:** → next node (fire-and-forget)  
**Example:** Notify the user that a long-running analysis workflow has completed.

#### `report`
**Label:** Report  
**Description:** Generates and saves a structured report from workflow outputs. Writes to `unifiedMemoryService` and optionally exports as JSON.  
**Inputs:** template, data fields  
**Outputs:** report object → next node  
**Example:** Produce a weekly governance summary from Maria's audit results.
