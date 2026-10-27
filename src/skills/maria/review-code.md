---
name: Review code
agent: maria
use_when: Alphonso's changed code needs a review.
task_types: [audit_code]
tools: [read_step_output, read_project_file]
steps: [read_step_output]
output: review_with_verdict
---
Read the files Alphonso changed and what they were meant to do. Look for mistakes, missing cases, unclear names, and anything the request asked for that isn't there. Give each finding with its file and line, the problem and the change you'd make. Pass when nothing needs changing; security goes to Sentinel.
