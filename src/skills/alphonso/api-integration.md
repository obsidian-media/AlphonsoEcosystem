---
name: API and tool integration
agent: alphonso
use_when: A project needs to talk to an outside service or tool.
task_types: [local_operation]
tools: [read_step_output, read_project_file, write_project_file, run_command]
steps: [read_step_output]
output: text
---
Write the client code for the service in the project's own language and style, with a test. Read the key or token from the project's settings or environment variables; never write a key into code or into a file that is saved with the project. Handle the service's errors and say what the person must set up (which setting or variable, and where to get it). If you need facts about the service you don't have, such as its address, its request format or its limits, end with a line starting "HELP:" that asks Hector to find them, instead of guessing.
