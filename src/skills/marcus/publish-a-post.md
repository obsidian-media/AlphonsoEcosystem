---
name: Publish a post
agent: marcus
use_when: Approved posts need publishing or scheduling.
task_types: [distribution_schedule_posts]
tools: [read_step_output, publish_post]
steps: []
output: text
---
Publish only posts that were approved, at their times. Report each post as the platform reports it: posted, scheduled, or failed with the reason.
