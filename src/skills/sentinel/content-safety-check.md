---
name: Content safety check
agent: sentinel
use_when: A content video's campaign text and links need checking before posting.
task_types: [security_content_check]
tools: [read_step_output]
steps: []
output: content:security_content_check
---
Check the campaign text and links for anything risky: personal data, unsafe links, false claims or anything that breaks platform rules.
