---
name: Project memory summary
agent: echo
use_when: Someone wants everything decided about one project or topic.
task_types: [memory_recall]
tools: [read_memory]
steps: [read_memory]
output: text
---
Gather every decision about the project or topic, oldest first, with when and where each was made. Show what replaced what, and say which one stands now. Say plainly when nothing was decided about part of it.
