// Companion Mode (Phase 3 / Draft B) greeting + quick-start content, grounded
// in each agent's REAL specialty as documented in MissionRoom.tsx's roster
// and their real backing services (mariaAuditService.ts, marcusExecutionService.js,
// echoMemoryService.js, sentinelSecurityService.js, novaAnalysisService.js) --
// NOT agentRegistry.js's MARIA_PROFILE/MARCUS_PROFILE title/purpose fields,
// which were found to have drifted (Marcus's own `strengths` array correctly
// lists "GitHub release management"/"distribution workflow automation" --
// his real job -- while his `title`/`purpose` describe Maria's real job,
// "Audit Manager"/"Audit code and project readiness", and vice versa for
// Maria). Flagged as a separate, unfixed data bug in bug-log.md rather than
// silently propagated into this new user-facing surface.

export interface CompanionAgentContent {
  emoji: string;
  greeting: string;
  quickStarts: string[];
}

export const COMPANION_CONTENT: Record<string, CompanionAgentContent> = {
  alphonso: {
    emoji: '💬',
    greeting: "Hey, I'm Alphonso. Ask me anything, or tell me what you want built or fixed.",
    quickStarts: ['What can you help me with?', 'Check if everything is running okay', 'Explain what this app does']
  },
  jose: {
    emoji: '🧭',
    greeting: "I'm Jose. I route your requests to the right agent and keep the team coordinated.",
    quickStarts: ['Plan out a small project for me', 'Who should I talk to for design work?', 'Give me a status update']
  },
  hector: {
    emoji: '🔎',
    greeting: "I'm Hector. Give me a topic and I'll research it with real sources.",
    quickStarts: ['Research the latest trends in...', 'Find sources on...', 'What are competitors doing with...']
  },
  miya: {
    emoji: '🎨',
    greeting: "Hi, I'm Miya! Tell me what you want to create.",
    quickStarts: ['A picture of...', 'A social post graphic', 'A short video']
  },
  maria: {
    emoji: '🛡️',
    greeting: "I'm Maria. I review risk, approvals, and whether something's actually safe to run.",
    quickStarts: ['Is this safe to approve?', 'Review this for risk', 'What needs my approval right now?']
  },
  marcus: {
    emoji: '📣',
    greeting: "I'm Marcus. Once something's approved, I handle getting it out the door.",
    quickStarts: ['Publish this once approved', 'Draft a release announcement', 'What are we shipping next?']
  },
  echo: {
    emoji: '🧠',
    greeting: "I'm Echo. I remember what's happened so you don't have to.",
    quickStarts: ['What did we decide about...', 'Remind me what happened last time', 'Summarize our recent conversations']
  },
  sentinel: {
    emoji: '🔒',
    greeting: "I'm Sentinel. I watch for anything risky before it becomes a problem.",
    quickStarts: ['Is anything unsafe right now?', 'Check this command before I run it', 'What are my security settings?']
  },
  nova: {
    emoji: '💡',
    greeting: "I'm Nova. I look at what you're working on and score what's worth doing next.",
    quickStarts: ["What's my best opportunity right now?", 'Score this idea for me', "What's worth prioritizing this week?"]
  }
};

export function getCompanionContent(agentId: string): CompanionAgentContent {
  return COMPANION_CONTENT[agentId] || COMPANION_CONTENT.alphonso;
}
