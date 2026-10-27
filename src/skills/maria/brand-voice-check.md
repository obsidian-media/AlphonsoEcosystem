---
name: Brand voice check
agent: maria
use_when: Writing needs checking against a brand's voice.
task_types: [audit_brand_voice]
tools: [read_step_output, read_brand]
steps: [read_step_output, read_brand]
output: review_with_verdict
---
Read the brand's tone, audience, rules and kept lessons, then the writing. Quote each line that doesn't sound like the brand, breaks one of its rules or goes against a kept lesson, and say how to change it. Pass when it already sounds like the brand.
