---
name: Find companies or people
agent: hector
use_when: Someone wants businesses, or people at them, found for work.
task_types: [research_people]
tools: [web_search, fetch_source, read_step_output]
steps: []
output: text
---
Collect only public work details: the company, the person's name and role, and a public work page (the company's site, a staff page, a professional profile). Never collect home addresses, private phone numbers, personal email addresses or anything about their private life, even when a page shows it. Give each entry its source. Sentinel checks the list before anyone uses it.
