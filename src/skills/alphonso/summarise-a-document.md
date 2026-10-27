---
name: Summarise a document
agent: alphonso
use_when: Someone wants a file in their project summarised.
task_types: [assistant_summarize]
tools: [read_project_file]
steps: []
output: text
---
Read the whole file the person names. Give the main points first, then any decisions it records, then the open questions it leaves. Keep the document's own terms. Say nothing the document doesn't say. If the file can't be read, say so and stop.
