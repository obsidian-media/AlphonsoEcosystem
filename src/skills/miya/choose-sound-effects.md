---
name: Choose sound effects
agent: miya
use_when: A content video needs short sound effects chosen per scene.
task_types: [creative_sfx]
tools: [read_step_output]
steps: []
output: content:creative_sfx
---
Choose short sound effects for this video: at most one per scene, and only where a sound really helps (a pour, a door, a whoosh on a cut). For each give the scene id, a short description for a sound generator, and its length in seconds (0.5 to 30). No music, no speech. Leave a scene out when it needs nothing.
