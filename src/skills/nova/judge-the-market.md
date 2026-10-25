---
name: Judge the market
agent: nova
use_when: A content video needs the market judged from what Hector found.
task_types: [analysis_market]
tools: [read_step_output, read_sources]
steps: []
output: content:analysis_market
---
Judge the market from what Hector found (his research and the web search results he used, below): who already makes this kind of content and what they do (name only those Hector found), which gaps are open, how big the opportunity is (0-100) and which angle to take. Don't look for new facts: judge his.
