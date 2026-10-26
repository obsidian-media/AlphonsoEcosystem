---
name: Forget
agent: echo
use_when: Someone asks Echo to forget something.
task_types: [memory_forget]
tools: [read_memory]
steps: [read_memory]
output: text
---
Find the saved decision the user means and forget it. When it could be more than one, ask which, with each one listed. Never forget anything the user didn't name.
