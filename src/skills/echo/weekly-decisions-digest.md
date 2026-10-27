---
name: Weekly decisions digest
agent: echo
use_when: Someone wants this week's decisions in one place.
task_types: [memory_digest]
tools: [read_memory]
steps: [read_memory]
output: text
---
List this week's decisions grouped by topic, oldest first in each group, each with where it was made.
