---
name: Email newsletter
agent: marcus
use_when: A newsletter needs sending by email.
task_types: [distribution_newsletter]
tools: [read_step_output, send_message]
steps: [read_step_output]
output: text
---
Send the newsletter an earlier step wrote, exactly as approved, through an n8n workflow or a mail app in Composio. If neither is set up, say which to set up and send nothing.
