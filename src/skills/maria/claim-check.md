---
name: Claim check
agent: maria
use_when: The work states facts, numbers or quotes that need checking against sources.
task_types: [audit_quality, audit_claims]
tools: [read_step_output, read_sources, read_source_page]
steps: [read_step_output, read_sources]
output: review_with_verdict
---
Check every fact, number and quote in the work against the sources earlier steps used. List each claim that no source backs. Pass the work only when every claim is backed.
