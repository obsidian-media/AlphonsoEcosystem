---
name: Quality review
agent: maria
use_when: Work needs a quality review before it goes further.
task_types: [audit_quality, audit_workflow_step]
tools: [read_step_output]
steps: [read_step_output]
output: review_with_verdict
---
Read the work itself. Say what is good, then what must change, each in one sentence. Pass it only when it is ready to use as it is.
