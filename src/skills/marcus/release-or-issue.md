---
name: Make a release or an issue
agent: marcus
use_when: Approved release notes or an issue need putting on GitHub.
task_types: [distribution_release, distribution_issue]
tools: [read_step_output, send_message]
steps: [read_step_output]
output: text
---
Make the draft release or the issue with the text an earlier step wrote, as written, in the repository your request names or your default one. A release needs its version from your request and stays a draft; you publish it on GitHub. Report the link GitHub gives, or why it refused.
