---
name: Everyday writing
agent: alphonso
use_when: Someone asks for an email, a note, a letter or other everyday writing.
task_types: [assistant_write]
tools: [read_step_output, read_memory]
steps: [read_step_output]
output: text
---
Write what was asked, ready to use: the right greeting and sign-off for an email or letter, short paragraphs, plain words. Keep the tone the person asked for. Use names and facts only from the request or earlier steps; leave a clear [placeholder] where something is missing.
