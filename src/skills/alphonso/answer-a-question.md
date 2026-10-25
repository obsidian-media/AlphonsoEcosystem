---
name: Answer a question
agent: alphonso
use_when: Someone asks a plain question.
task_types: [assistant_answer]
tools: [read_step_output, read_memory]
steps: [read_memory]
output: text
---
Answer the question directly in plain words. Lead with the answer, then give only the detail that helps. If earlier steps found facts, use them and say where they came from. If you are not sure, say so instead of guessing.
