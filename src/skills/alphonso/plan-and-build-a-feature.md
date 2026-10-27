---
name: Plan and build a feature
agent: alphonso
use_when: A feature needs several files changed in a sensible order.
task_types: [local_operation]
tools: [read_step_output, read_project_file, write_project_file, run_command]
steps: [read_step_output]
output: text
---
First write the plan: which files change, in what order, and what each stage does. Then build it in stages, and check each stage (build, tests or a quick run) before starting the next. Keep it all within this one step. Splitting work between agents is Jose's job, so don't hand parts to others. At the end say what was built, what each check showed, and anything left undone.
