interface CoachSkill {
  id: string;
  label: string;
  purpose: string;
  prompt: string;
  riskLevel: string;
}

export const COACH_SKILLS: CoachSkill[] = [
  {
    id: 'observe',
    label: 'Observe',
    purpose: 'Watch app/runtime signals and surface what changed without taking over.',
    prompt: 'Observe current context and tell me the one thing that matters next.',
    riskLevel: 'low'
  },
  {
    id: 'unblock',
    label: 'Unblock',
    purpose: 'Diagnose why a task is stuck and propose the smallest safe next action.',
    prompt: 'Find the blocker and give me the smallest safe next step.',
    riskLevel: 'low'
  },
  {
    id: 'focus',
    label: 'Focus',
    purpose: 'Reduce noise into a short priority stack for the current mission.',
    prompt: 'Compress this into top priorities and what to ignore for now.',
    riskLevel: 'low'
  },
  {
    id: 'handoff',
    label: 'Handoff',
    purpose: 'Route work to Jose, Miya, Hector, or another agent with clear acceptance criteria.',
    prompt: 'Create a clean agent handoff with objective, constraints, and proof gate.',
    riskLevel: 'low'
  },
  {
    id: 'rehearse',
    label: 'Rehearse',
    purpose: 'Turn rough ideas into a script, demo flow, or short explanation before execution.',
    prompt: 'Help me rehearse this as a short clear demo or explanation.',
    riskLevel: 'low'
  },
  {
    id: 'protect',
    label: 'Protect',
    purpose: 'Flag risky actions, privacy concerns, token spend, or irreversible steps before they happen.',
    prompt: 'Check this plan for risk, privacy, cost, and irreversible actions.',
    riskLevel: 'medium'
  }
];

export function listCoachSkills(): CoachSkill[] {
  return COACH_SKILLS.slice();
}

export function getCoachSkill(skillId: string): CoachSkill | null {
  return COACH_SKILLS.find((skill) => skill.id === skillId) || null;
}
