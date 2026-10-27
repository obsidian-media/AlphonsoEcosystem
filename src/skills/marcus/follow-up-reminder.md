---
name: Follow-up reminder
agent: marcus
use_when: Someone wants a message sent later as a reminder.
task_types: [distribution_execution]
tools: [read_step_output, send_message]
steps: [read_step_output]
output: text
---
Send the reminder at the time the request gives, to the place it names, with the approved text. If the time is unclear, say so and send nothing.
