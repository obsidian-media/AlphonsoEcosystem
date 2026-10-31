# Agent Guide

Alphonso has nine agents. Each kind of work has exactly one owner, and Jose gives every step of a request to that agent. You don't have to name the agent: say what you want and Jose plans it.

Everyone may read and create new files of their own. Only **Alphonso** changes your project files or runs code, and only **Marcus** sends or publishes. Spending money (a paid model, a paid voice or video service) only happens on steps that ask you first with the cost.

## The agents

### Jose — plans every request
Answers plain questions himself; anything bigger he plans as steps, gives each to its owner, and reports back with a short summary. He adapts a plan while it runs: a review that sends work back, an agent asking for help, a larger model when a step keeps failing. He does none of the work himself.
- **Ask:** anything. "Research X, write a post and put it on Slack" becomes steps for Hector, Alphonso, Maria and Marcus.
- **Where:** plans and their progress are on the Requests board (System → Orchestrator → Requests).

### Alphonso — code, questions and everyday writing
Works in the projects you list (Settings → Agents → Alphonso's projects). He reads your files, shows the change on the board (file by file, with each command and why), and writes it only after you approve. Then he runs the checks, fixes what fails (at most twice) and says what he did. He also answers questions and writes emails and notes.
- **Ask:** "In shop, add a dark mode toggle", "Fix this error: …", "Write tests for the cart", "Explain the code in blog", "Draft an email declining the meeting".
- **Won't:** change anything or run a command that isn't read-only without your approval; commit to git or start a dev server unless you ask.
- **Skills:** Answer a question, Everyday writing, Code change, Verify a build, Fix a bug from an error, Write tests, Explain code, Summarise a document, API and tool integration, Plan and build a feature.

### Hector — research
Breaks a question into parts, searches, reads the relevant parts of each page and goes back for what's missing. His report starts with the answer, with numbered sources and how well each finding is supported. If nothing usable turns up he says why; he never fills in facts from memory.
- **Ask:** "Research the coffee subscription market in Canada", "Compare these three microphones on price and features", "Find what's working in cooking Shorts this month".
- **Won't:** judge which option is best (that's Nova), write the content, or send anything.
- **Skills:** Web research with sources, Competitor material, Find what works, Stock footage, Compare products and prices, Find companies or people.

### Nova — what to do first
Judges value, effort, risk and timing, from Hector's research when there is some. Her answer starts with **What to do first**, ranks every option with why, and says what would change her mind.
- **Ask:** "Which should my bakery do first: a newsletter, a loyalty card or a podcast?", "Research the market and tell me which opportunity is worth going after."
- **Won't:** gather facts herself; with nothing to judge she asks Hector first.
- **Skills:** Value and priority, Judge the market, Review the script, Best time to post, Read the results, Follow-up ideas, Pros and cons, Pricing.

### Miya — content and design
Scripts, pictures, voice-overs, music, videos, Shorts, carousels, campaigns and UI design. Miya Studio (Work → Creative) is her content factory, from an idea to posted videos.
- **Ask:** "Make a YouTube video about home coffee", "Create an image of …", "Make a video of a cat on a boat", "Create calm piano music for my intro", "Write a carousel about our new menu".
- **Won't:** write code or send anything; paid engines (ElevenLabs, Higgsfield, Runway) only after you approve the cost.
- **Skills:** Write the script, Plan the scenes, Design thumbnails, Plan the Shorts, Choose sound effects, Write a carousel, Write the campaign, Creative lessons, Creative package, UI design, Edit the video, Make a picture.

### Maria — quality and risk
Reviews work: **Pass.** or **Fix:**, quoting the exact words to change and how, and listing claims no source backs. Work that needs changes goes back to its author (at most twice). She also audits plans for risk (**Risk:** low, medium or high) without starting anything, and when she asks for your approval the next steps wait.
- **Ask:** "…and have it checked for accuracy", "Audit this plan for compliance risks: …", "Review the code change in shop".
- **Won't:** do security checks (that's Sentinel).
- **Skills:** Quality review, Claim check, Governance review, Quality against the references, Review code, Brand voice check.

### Sentinel — security
Answers **Safe.**, **Risky:** or **Unsafe:**, with each finding, where it is and the fix. He always flags keys or passwords in text, requests for a password, links that look disguised, and commands that delete or run code. He checks on his own before anything is sent, after code changes, and on any request with a key or a link. A key in your request is hidden from every agent.
- **Ask:** "Check this post for security problems before I publish it: …", "Check shop's dependencies".
- **Won't:** judge quality (that's Maria).
- **Skills:** Text and link check, Permission audit, Content safety check, Dependency check, Personal-data check.

### Marcus — sending and publishing
Sends exactly what was written (or what you quoted) to Slack, Discord, Telegram, WhatsApp, Notion, ClickUp, GitHub, n8n, Composio apps and your outside tools, and posts Miya Studio's videos at their times. The approval shows the exact text and where it goes; he sends it once.
- **Ask:** "Post it to Slack #news", "Send it tomorrow at 9", "Make a draft GitHub release v1.2.0", "Is this ready to post?" (only checks; sends nothing).
- **Won't:** change the words, send anywhere you didn't name or set as a default, or send without your approval.
- **Skills:** Send a message, Publish a post, Place a call, Release readiness, Make a release or an issue, Email newsletter, Follow-up reminder, Use an outside tool.

### Echo — memory
Keeps what you decided, preferred or turned down, wherever it happened, and gives every agent the decisions that apply to its work. Nothing is made up; a cleanup changes nothing until you apply it.
- **Ask:** "Remember that …", "What did we decide about the launch?", "Forget …", "Clean up my memory", "What did we decide this week?"
- **Skills:** Save decisions, Answer from memory, Forget, Merge and clean memory, Weekly decisions digest, Project memory summary.

## How they work together

```
You: "Research AI trends, write a short post about them and post it to Slack #news"
  Hector    researches, with sources
  Alphonso  writes the post from Hector's research
  Maria     checks it for accuracy (may send it back, at most twice)
  Sentinel  checks it before it is sent
  Marcus    waits with the exact text: approve once, and it's posted
  Echo      remembers what was decided
```

Each step gets the full work of the steps before it, so a reviewer reads the actual draft and Marcus sends what was written. When an agent can't work until something is set up, the step waits and says what; it's never handed to another agent.

## What asks first

| Agent | Changes project files | Runs code | Spends | Sends or publishes |
|---|---|---|---|---|
| Alphonso | Your choice | Your choice | — | — |
| Marcus | — | — | Always asks | Always asks |
| Miya | — | — | Paid media steps, always asks | — |
| Jose | — | — | Paid-model steps, always asks | — |
| Everyone else | — | — | — | — |

Choose what else asks in Settings → General → **What asks first**.

## Choosing each agent's model

By default every agent uses your local model. In **Settings → Connectors → Agent Providers** you can give an agent a different one: another Ollama model, NVIDIA or Gemini (free tiers), one of OpenRouter's free models, or a **Hermes profile** (install Hermes Agent in Runtime Hub, then set up a profile for that agent; it then uses Hermes's own tools, such as web search, and asks you before running commands).

## Your own skills and teams

**System → All Agents → Skills** lists every agent's skills, how often each is used and how its work did in reviews. Add your own with **New skill** or **Import**; a skill can only give an agent work it owns.

**System → Teams** saves a set of agents for a job you do often; run it with "use team <name> to …".

## Voice

With Voice OS running (System → Voice), the same agents answer what you say: the one whose work it is answers, and says who does it when you ask for someone else's work.
