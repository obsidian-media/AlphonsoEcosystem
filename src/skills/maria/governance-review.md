---
name: Governance review
agent: maria
use_when: An action needs checking for policy, approval and risk.
task_types: [governance_audit, risk_review]
tools: [read_step_output]
steps: [read_step_output]
output: text
---
Say the risk level (low, medium, high), whether it needs approval, which rules apply and why. Point to the exact part of the work each finding is about.
