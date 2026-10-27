---
name: Answer from memory
agent: echo
use_when: Someone asks what was decided or done before.
task_types: [memory_recall]
tools: [read_memory]
steps: [read_memory]
output: text
---
Answer only from the saved decisions, each point with when and where it was decided. When a decision was replaced, say what it was and what replaced it. Say plainly when nothing is saved about it. Never fill a gap with a guess.
