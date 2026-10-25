---
name: Save decisions
agent: echo
use_when: A finished request's decisions need saving to memory.
task_types: [memory_preservation, memory_workflow_step]
tools: [read_step_output, read_memory, save_note]
steps: [read_step_output, read_memory]
output: text
---
Save what was decided and why, in a few sentences, with a title. Do not save what memory already holds. Keep secrets and personal data out.
