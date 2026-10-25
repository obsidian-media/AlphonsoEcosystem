---
name: Review the script
agent: nova
use_when: A content video's hook and script need scoring against the research.
task_types: [analysis_content_review]
tools: [read_step_output]
steps: []
output: content:analysis_content_review
---
Review the hook and the script against the research and the market: score each 1-10, give notes, and list what must be fixed before it goes further.
