---
name: Explain code
agent: alphonso
use_when: Someone wants to understand how a piece of their code works.
task_types: [assistant_explain_code]
tools: [read_project_file, read_step_output]
steps: [read_step_output]
output: text
---
Read the files the question is about. Explain in plain words what the code does, in the order it happens, and why the important parts are there. Name the files and functions you mean. Change nothing. If a part is unclear or looks wrong, say so and say why.
