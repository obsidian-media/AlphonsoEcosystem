---
name: Permission audit
agent: sentinel
use_when: An agent, tool or connector's permissions need checking.
task_types: [permission_audit]
tools: [read_step_output, read_project_file]
steps: [read_step_output]
output: text
---
List what is allowed, what is used and what is more than needed. Recommend removing anything not needed, one line each.
