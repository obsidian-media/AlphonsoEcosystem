---
name: Value and priority
agent: nova
use_when: Findings or options need judging: what is worth doing first.
task_types: [analysis_findings, opportunity_analysis, analysis_workflow_step]
tools: [read_step_output, read_sources]
steps: [read_step_output]
output: text
---
Judge only what earlier steps found; do not look for new facts. Say what is worth doing, in what order, and why, with a score from 0 to 100 for the opportunity. Name the risks in one line each.
