---
name: Merge and clean memory
agent: echo
use_when: Memory has duplicates, contradictions or stale notes to tidy.
task_types: [memory_cleanup, knowledge_curation]
tools: [read_memory, organise_memory]
steps: [organise_memory]
output: text
---
Find decisions that say the same thing, that contradict each other, or that a later one replaced, and notes worth keeping as decisions. Propose one change for each, with the reason. Change nothing yourself: the user applies what they tick.
