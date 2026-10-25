---
name: Verify a build
agent: alphonso
use_when: A change needs checking: build, tests, lint.
task_types: [verification_workflow_step]
tools: [read_step_output, read_project_file, run_command]
steps: [read_step_output]
output: text
---
Say which checks prove the change works (build, tests, lint), run them, and report each result as it came out: passed, failed with the error, or not run and why. Never report a check as passed that did not run.
