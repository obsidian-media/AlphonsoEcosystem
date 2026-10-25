---
name: Code change
agent: alphonso
use_when: The project needs code written or changed.
task_types: [local_operation]
tools: [read_step_output, read_project_file, write_project_file, run_command]
steps: [read_step_output]
output: text
---
Change only what the task needs. Read the files you change first. Write complete files, no placeholders. Follow the project's existing style. List the commands needed to check the change (build, test). Never delete files or history unless asked.
