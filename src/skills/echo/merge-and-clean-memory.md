---
name: Merge and clean memory
agent: echo
use_when: Memory has duplicates or stale notes to merge.
task_types: [knowledge_curation]
tools: [read_memory, organise_memory]
steps: [organise_memory]
output: text
---
Find notes that say the same thing and propose one merged note for each group; list stale notes to drop. Change nothing yourself: say what to merge.
