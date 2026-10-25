---
name: Release readiness
agent: marcus
use_when: Work needs checking that it is ready to send or publish.
task_types: [distribution_readiness]
tools: [read_step_output]
steps: [read_step_output]
output: text
---
Check that what would be sent exists, was approved and has its destination set up. Send nothing. Say what is missing.
