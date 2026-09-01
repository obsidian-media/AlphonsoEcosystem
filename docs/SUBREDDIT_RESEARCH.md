# Subreddit Research: AlphonsoEcosystem Launch

> Research compiled: 2026-09-01
> Target launch branch: `launch/day1-critical-fixes`
> Product: Alphonso v2.6.5 — Local-first AI desktop companion (Tauri v2 + Ollama)

---

## 1. r/LocalLLaMA

### Community Profile
| Metric | Value |
|--------|-------|
| Subscribers | ~1.9M+ |
| Created | March 10, 2023 |
| Focus | Locally hostable AI, open-weight models, hardware builds |

### Top Posts & Engagement Patterns (2025–2026)
- **Model releases dominate**: Bitnet (1,208 upvotes), Gemma 2B/7B (1,181), Llama 3.1 405B (1,082), DeepSeek (2,316), Llama 3.2 (1,615)
- **Hardware builds = viral**: 14x RTX 3090 (1,864), 4x RTX 4090 (1,481), 10x 3090 (882)
- **Memes about Big Tech**: "Zuckerberg watching you use Qwen" (2,932 — highest), "Enough already if I can't run it on my 3090" (3,399 — all-time highest)
- **Tool launches that worked**: Open WebUI (749), Papeg.ai (1,061 — "I've been working on this for 6 months, free easy...")
- **Community values**: real benchmarks, reproducibility, "runs on consumer hardware," behind-the-scenes truth
- **Community hates**: hype without substance, cloud-only solutions, unbenchmarked claims

### Self-Promotion Rules
- **Rule 4**: Strict 1/10 (90/10) guideline — no more than 10% of your activity should be self-promotion
- Affiliation MUST be disclosed clearly
- Must be a genuine participant before posting your own stuff
- Moderators check user profiles — if history is nothing but product links, flagged instantly
- Verified by Thread Otter (Aug 2026): written rules take no clear position but Rule 4 is enforced

### Best Posting Time
- US morning (9–11am EST) / EU afternoon (2–4pm CET)
- Avoid weekends for launch posts (lower engagement)
- Tuesday–Thursday optimal

### Verdict for Alphonso
**Challenging but possible.** Must lead with "runs locally on consumer hardware" and provide real benchmarks. Frame as a tool for the community, not a sales pitch. Papeg.ai proved it can be done (1,061 upvotes for a solo dev's app).

---

## 2. r/Tauri

### Community Profile
| Metric | Value |
|--------|-------|
| Weekly Visitors | ~4,100 |
| Weekly Contributions | ~124 |
| Focus | Tauri framework development, plugins, app showcases |

### What Gets Upvoted
- Real Tauri app showcases with code/plugin discussions
- Plugin development updates
- Migration stories (Tauri v1 → v2)
- Performance comparisons (Tauri vs Electron)

### Posting Frequency
- Low-volume subreddit — 1-2 quality posts per week is fine
- No strict self-promotion rules beyond Reddit's baseline
- Community is small but highly technical and engaged

### Verdict for Alphonso
**Good fit for technical deep-dive.** Post about the Tauri v2 architecture, Rust backend design, or specific technical challenges solved. NOT for marketing — for engineering credibility.

---

## 3. r/selfhosted

### Community Profile
| Metric | Value |
|--------|-------|
| Focus | Self-hosted services, data sovereignty, privacy |
| Megathread | Weekly "New Project Megathread" for projects <3 months old |

### Megathread Rules
- New projects MUST go in the current week's megathread (no standalone posts)
- Projects must be younger than 3 months to qualify
- Mobile apps allowed ONLY as companion to a self-hosted service
- All posts must be about self-hosting
- Explain what you've tried and what you're stuck on (for help posts)

### Launch Post Etiquette
- Standalone launch posts are NOT allowed for new projects
- Must post in the weekly megathread
- Format: project name, what it does, how to self-deploy, what's new/different
- Engage with comments — don't just drop and run

### Verdict for Alphonso
**Complicated.** Alphonso is a desktop app, not a self-hosted service. The iOS companion + cloud voice backend (Railway) might qualify as "self-hostable companion," but the core desktop app doesn't fit. **Recommendation: Skip or post only about the cloud voice backend as a self-hosted service.**

---

## 4. r/SideProject

### Community Profile
| Metric | Value |
|--------|-------|
| Focus | Sharing side projects, getting constructive feedback |
| Culture | Supportive, "show and tell" vibe |

### Best-Performing Launch Posts
- "I built X" with a short demo and honest story
- Posts with 50+ upvotes typically have: clear problem statement, demo/GIF, personal journey
- Vulnerability performs well ("I spent 2 months building and almost nobody...")
- Posts that engage in comments outperform drive-by launches

### Flairs
- Use appropriate flair (typically "Show" or "Launch" if available)
- Unflaired posts are automatically removed

### Rules
- Share your project, not just a link — describe what you built and why
- No repeated posting of the same project
- Engage consistently with the community
- Self-promotion is allowed with conditions (be a participant, not just a promoter)

### Verdict for Alphonso
**Strong fit.** This is the best subreddit for a launch post. Frame as a side project story: "I built a local-first AI companion with 9 agents — here's what I learned."

---

## 5. r/opensource / r/opensourceAI

### Critical Note on Alphonso's License
**Alphonso uses the SHALAUDE v1.0 license: "All Rights Reserved, Source-Visible."**

This is **NOT** an OSI-approved open-source license. It is a **source-visible** license that:
- Grants NO rights to use, modify, distribute, or create derivatives
- Explicitly prohibits commercial or non-commercial use without written permission
- Is proprietary with source code available for viewing only

### Community Rules on Source-Visible Licenses
- r/opensource requires OSI-approved licenses for "open source" posts
- Calling SHALAUDE "open source" would be called out and likely removed
- The community distinguishes between "open-weight," "source-visible," and "open source"
- Meta's Llama Community License is already controversial — SHALAUDE is even more restrictive

### Verdict for Alphonso
**Do NOT post in r/opensource or r/opensourceAI as an "open source" project.** If posting, be extremely clear: "source-visible, not open source." Better to avoid entirely and focus on r/LocalLLaMA, r/SideProject, r/Tauri.

---

## 6. Successful Local AI Tool Launches on Reddit (2025–2026)

### 1. Open WebUI (r/LocalLLaMA)
- **Upvotes**: 749+ on announcement
- **What made it work**: Solved a real pain point (web UI for Ollama), free, actively maintained, community-driven
- **Key**: Was already widely used before the "launch" post — the post was a victory lap

### 2. Papeg.ai (r/LocalLLaMA)
- **Upvotes**: 1,061
- **What made it work**: Solo dev, 6 months of work, "free easy to use," packed with features, genuine enthusiasm
- **Key**: Authentic "I built this for us" energy, not corporate marketing

### 3. Work Review (r/selfhosted)
- **Upvotes**: Strong engagement
- **What made it work**: Local-first desktop app that records work context, self-hostable, privacy-focused
- **Key**: Fits the self-hosted ethos perfectly

### 4. "I built a CLI with Ollama to rename your files" (r/LocalLLaMA)
- **Upvotes**: 574
- **What made it work**: Simple, useful, specific, free, open source
- **Key**: Solves one problem well, easy to try immediately

### 5. Local-First AI: Why I Started Building My Own System (r/LocalLLaMA)
- **Upvotes**: High engagement
- **What made it work**: Personal story, philosophical alignment with community values, educational
- **Key**: Story-driven, not product-driven

---

## 7. Failed Launches & What Went Wrong

### 1. Generic "AI Superapp" Posts (Multiple Subreddits)
- **What happened**: Posts claiming "world's first AI everything" with no demo, no benchmarks, no substance
- **Result**: Downvoted to zero, comments calling out vaporware
- **Lesson**: The community has zero tolerance for hype without proof

### 2. Cloud-Only "Local AI" Claims (r/LocalLLaMA)
- **What happened**: A startup posted about "local AI" but required API keys and cloud compute
- **Result**: Immediate backlash, comments pointing out the contradiction, post removed
- **Lesson**: "Local" means runs on YOUR machine, not "we have a data center"

### 3. Open Source Washing (r/opensource)
- **What happened**: A company posted their "open source AI" but used a custom license with commercial restrictions
- **Result**: Community called out the license, post removed, reputation damage
- **Lesson**: Don't call it open source unless it's OSI-approved. Be transparent about licensing.

---

## 8. User Personas & Channel Mapping

### Persona 1: "Local-First Developer"
- **Who**: Developer/engineer who runs LLMs locally, values privacy, owns their stack
- **Pain points**: Cloud dependency, API costs, data leaving their machine
- **What they want**: Tools that run on consumer hardware, respect privacy, are hackable
- **Channels**: r/LocalLLaMA, r/selfhosted, r/Tauri
- **Messaging**: "Runs entirely on your machine. No cloud required. Ollama-powered."

### Persona 2: "AI Side Project Enthusiast"
- **Who**: Indie hacker, builder, tinkerer who shares projects and learns from others
- **Pain points**: Building alone, getting feedback, finding users
- **What they want**: Inspiration, technical stories, community validation
- **Channels**: r/SideProject, r/LocalLLaMA, r/Tauri
- **Messaging**: "I built a 9-agent AI companion over X months — here's what I learned."

---

## 9. Strategic Recommendations

### Do
- Lead with "runs locally on your machine via Ollama"
- Provide real benchmarks (tokens/sec on consumer hardware)
- Be transparent about the SHALAUDE license (source-visible, not open source)
- Engage in comments — don't just post and run
- Post in r/SideProject first (most welcoming), then r/LocalLLaMA (if you have community history)
- Consider r/Tauri for a technical architecture deep-dive

### Don't
- Call Alphonso "open source" anywhere
- Post standalone in r/selfhosted (use megathread, and only if self-hosted angle is real)
- Hype without substance — the community will fact-check
- Post from a brand-new account with no history
- Ignore comments or questions

### License Messaging
- **Say**: "Source-visible under the SHALAUDE license"
- **Don't say**: "Open source," "free as in freedom," "community-driven development"
- **If asked**: Be honest — "The source is visible for transparency and auditing, but it's not OSI-approved open source. The core is proprietary."
