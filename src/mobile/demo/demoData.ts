// Sample data for "Try a demo" (phone phase 3 part C): made up for the demo, no real names, keys or
// addresses. Shapes match what the computer mirrors to the phone, so the real screens show it.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const DEMO_PROJECT_ID = 'demo-project';
export const DEMO_BRAND = { id: 'demo-brand', name: 'Corner Bakery (sample)' };

/** Two pictures drawn for the demo, as SVG text. */
function scene(title: string, sky: string, ground: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#fff4e0"/></linearGradient></defs>`
    + `<rect width="720" height="1280" fill="url(#g)"/>`
    + `<circle cx="540" cy="260" r="110" fill="#ffd27a" opacity="0.9"/>`
    + `<rect x="0" y="880" width="720" height="400" fill="${ground}"/>`
    + `<rect x="170" y="560" width="380" height="330" rx="18" fill="#c8794a"/>`
    + `<polygon points="140,580 360,420 580,580" fill="#8a4b2c"/>`
    + `<rect x="320" y="720" width="80" height="170" rx="8" fill="#5a3320"/>`
    + `<text x="360" y="1120" font-family="Arial, sans-serif" font-size="54" font-weight="700" text-anchor="middle" fill="#ffffff">${title}</text>`
    + `<text x="360" y="1190" font-family="Arial, sans-serif" font-size="30" text-anchor="middle" fill="#ffffff" opacity="0.85">Sample picture</text>`
    + `</svg>`;
}

export const DEMO_PICTURES: Record<string, string> = {
  'demo/scenes/v1-s1.svg': scene('Fresh at 6 am', '#7fb3e6', '#6b8f4e'),
  'demo/scenes/v1-s2.svg': scene('Warm from the oven', '#e6a77f', '#8f6b4e'),
};

function step(summary: string, status = 'done') {
  return { status, versions: [{ version: 1, summary, output: {} }], chosenVersion: 1, error: null, progress: [] };
}

export function demoMirror(nowMs: number) {
  const research = {
    answer: 'Mornings sell most: about two thirds of a small bakery\'s bread goes before 10 am (sample).',
    rounds: 1, providers: [], disagreements: [], notFound: [],
    subQuestions: [{ question: 'When do customers buy bread?', status: 'answered', findings: [{ text: 'Most bread sells before 10 am.', sources: [1], support: 'one' }] }],
    sources: [{ n: 1, title: 'Sample bakery survey', url: 'https://example.com/sample-survey', kind: 'general', label: 'read', excerpt: '' }],
  };
  const sendText = 'Fresh loaves are out at 6 am every day. Come early, they go fast!';
  const waiting = {
    id: 'demo-request-1', commandId: 'demo-command-1', source: 'user', kind: 'normal', status: 'waiting_approval',
    text: 'Find when our customers buy bread, then post a note to the team on Slack.',
    createdAtMs: nowMs - 2 * HOUR, updatedAtMs: nowMs - HOUR,
    steps: [
      { stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], status: 'done', instruction: 'Find when customers buy bread.' },
      {
        stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['hector'], status: 'waiting_approval',
        instruction: 'Post the finding to the team.',
        sendPreview: { connector: 'slack', kind: 'message', label: 'Slack #team', target: '#team', text: sendText, sourceStepId: 'hector', preparedAtMs: nowMs - HOUR },
      },
    ],
  };
  const done = {
    id: 'demo-request-2', commandId: 'demo-command-2', source: 'user', kind: 'normal', status: 'done',
    text: 'Write a short thank-you note for our regulars.',
    createdAtMs: nowMs - DAY, updatedAtMs: nowMs - DAY + HOUR,
    steps: [{ stepId: 'alphonso', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [], status: 'done', instruction: 'Write the note.' }],
  };
  const posts = [
    { id: 'demo-post-1', platform: 'instagram', piece: 'reel', title: '', caption: 'Fresh at 6 am. Come early!', hashtags: ['bakery', 'fresh'], scheduledAtMs: nowMs + DAY, status: 'scheduled' },
    { id: 'demo-post-2', platform: 'youtube', piece: 'short', title: 'Warm from the oven', caption: 'A minute in our kitchen.', hashtags: ['baking'], scheduledAtMs: nowMs + 3 * DAY, status: 'draft' },
  ];
  const project = {
    id: DEMO_PROJECT_ID, brandId: DEMO_BRAND.id, name: 'Morning bread video (sample)', updatedAtMs: nowMs - HOUR,
    brief: { idea: 'A short video about our 6 am bread.' },
    steps: {
      script: step('A 30-second script: the oven opens at 6, first customers, the last loaf.'),
      review: step('Clear and short; one fix suggested.', 'needs_approval'),
      scenes: step('Two scenes with pictures.'),
    },
    posts,
    media: Object.keys(DEMO_PICTURES).map((path) => ({ projectId: DEMO_PROJECT_ID, path, kind: 'picture' as const })),
  };
  const calendar = posts.map((p) => ({
    id: `post:${p.id}`, kind: 'post' as const, brandId: DEMO_BRAND.id, brandName: DEMO_BRAND.name, brandColor: '#30a46c', initials: 'CB',
    platform: p.platform, piece: p.piece === 'reel' ? 'Reel' : 'Short', isShort: p.piece === 'short', title: p.title || p.caption, caption: p.caption,
    atMs: p.scheduledAtMs, hasTime: true, status: p.status, statusLabel: p.status === 'scheduled' ? 'Scheduled' : 'Draft', needsYou: false,
    projectId: DEMO_PROJECT_ID, projectName: project.name, postId: p.id, draggable: false, movesOnPlatform: false,
  }));
  return {
    requests: [waiting, done],
    stepOutputs: {
      'demo-command-1': [{ stepId: 'hector', agent: 'hector', summary: research.answer, schema: research }],
      'demo-command-2': [{ stepId: 'alphonso', agent: 'alphonso', summary: 'Thank you for starting your mornings with us. See you tomorrow at 6!' }],
    },
    chat: [
      { id: 'demo-chat-1', role: 'user' as const, text: 'What should I bake more of this week?', atMs: nowMs - 3 * HOUR },
      { id: 'demo-chat-2', role: 'assistant' as const, text: 'Your morning loaves sell out first, so bake a few more of those and fewer afternoon pastries (sample answer).', atMs: nowMs - 3 * HOUR + 60_000 },
      { id: 'demo-chat-3', role: 'user' as const, text: 'Thanks, tell the team on Slack.', atMs: nowMs - 2 * HOUR },
    ],
    computer: { name: 'Demo computer', demo: true },
    content: { projects: [project], brands: [DEMO_BRAND], calendar },
  };
}
