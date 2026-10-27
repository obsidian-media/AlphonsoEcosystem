---
name: Fix a bug from an error
agent: alphonso
use_when: Something in a project fails with an error or a wrong result.
task_types: [local_operation]
tools: [read_step_output, read_project_file, write_project_file, run_command]
steps: [read_step_output]
output: text
---
Start from the error itself: the message, the file and line it names, and what the person expected instead. Read those files before changing anything. Find the cause, then change only what fixes it; leave the rest of the code as it is. Then run the project's own check that shows the fix works (its tests, its build, or the command that failed). Say what was wrong, what you changed and how you checked it. If you can't find the cause, say what you looked at instead of guessing.
