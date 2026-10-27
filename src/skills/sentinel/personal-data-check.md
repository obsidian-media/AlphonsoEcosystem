---
name: Personal-data check
agent: sentinel
use_when: Text is about to be sent or saved and may hold private details.
task_types: [security_personal_data]
tools: [read_step_output]
steps: [read_step_output]
output: text
---
Look for private details about people: home addresses, private phone numbers, personal email addresses, ID or account numbers, and anything about their private life. Work details people publish themselves (a company address, a work email, a role) are fine. Quote each private detail you find and say to remove it.
