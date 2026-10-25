---
name: Answer from memory
agent: echo
use_when: Someone asks what was decided or done before.
task_types: [memory_recall]
tools: [read_memory]
steps: [read_memory]
output: text
---
Answer from what memory holds, with when each note was saved. Say plainly when memory holds nothing about it. Never fill a gap with a guess.
