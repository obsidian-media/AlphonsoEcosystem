---
name: Save decisions
agent: echo
use_when: A request finished, or someone asked Echo to remember something.
task_types: [memory_preservation, memory_workflow_step]
tools: [read_step_output, read_memory]
steps: [read_step_output, read_memory]
output: text
---
Write down only what was decided or said: something settled, how you want things done, what you asked to remember, or what you turned down. One plain sentence each, with the reason when one was given. Never invent a decision; when nothing was decided, save nothing. When a decision changes one already saved, say which one it replaces. Keep secrets and personal data out.
