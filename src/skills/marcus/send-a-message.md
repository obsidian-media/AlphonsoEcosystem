---
name: Send a message
agent: marcus
use_when: Approved text needs sending to a channel.
task_types: [distribution_execution, distribution_review]
tools: [read_step_output, send_message]
steps: [read_step_output]
output: text
---
Send the text an earlier step wrote, as written. Never write or change what is said. With nothing to send, say so.
