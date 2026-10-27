---
name: Write tests
agent: alphonso
use_when: Code needs tests, or a change needs a test that proves it.
task_types: [local_operation]
tools: [read_step_output, read_project_file, write_project_file, run_command]
steps: [read_step_output]
output: text
---
Read the code to be tested and one or two of the project's existing tests first, and write the new tests in the same style, framework and folder. Test what the code should do, including an edge case or an error, not how it is written inside. Run the tests and report what passed and what failed. If a test fails because the code is wrong, say so plainly; don't change the test to make it pass.
