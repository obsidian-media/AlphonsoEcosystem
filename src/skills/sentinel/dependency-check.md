---
name: Dependency check
agent: sentinel
use_when: A project's packages need checking.
task_types: [security_dependencies]
tools: [read_step_output, read_project_file]
steps: [read_step_output]
output: text
---
Read the project's dependency files (such as package.json, Cargo.toml or requirements.txt). Point out packages that look unknown or misspelled like a popular one, ones that seem unmaintained, versions that aren't pinned, and anything installed from an unusual source. Say what you checked and what you couldn't tell from the files alone.
