export const MIYA_COMFY_WORKFLOW_PRESETS = [
  {
    id: 'alphonso-brand-poster',
    name: 'ALPHONSO Brand Poster',
    mediaType: 'image',
    status: 'model_required',
    localOnly: true,
    description: 'Generate a polished hero poster or social graphic for ALPHONSO brand awareness.',
    promptTemplate: 'A premium cinematic AI command center poster for ALPHONSO, local-first AI agent ecosystem, neon blue and violet, clean product marketing, futuristic but trustworthy, high detail',
    recommendedUse: 'Launch posts, website hero drafts, thumbnails, announcement graphics.'
  },
  {
    id: 'agent-character-card',
    name: 'Agent Character Card',
    mediaType: 'image',
    status: 'model_required',
    localOnly: true,
    description: 'Create profile-card visuals for Alphonso, Miya, Jose, Hector, Maria, Marcus, Sentinel, Echo, or Nova.',
    promptTemplate: 'A polished character card for {agentName}, an AI agent in the ALPHONSO ecosystem, expressive mascot portrait, readable UI card layout, premium SaaS brand style',
    recommendedUse: 'Agent introductions, onboarding, carousel posts, feature explainers.'
  },
  {
    id: 'workflow-explainer-storyboard',
    name: 'Workflow Explainer Storyboard',
    mediaType: 'image',
    status: 'model_required',
    localOnly: true,
    description: 'Generate storyboard frames for explaining a workflow before turning it into video.',
    promptTemplate: 'Three-panel storyboard showing ALPHONSO coordinating agents to complete a task: chat command, agent delegation, verified output, modern UI, cinematic lighting, clear visual storytelling',
    recommendedUse: 'Screen-record narration, short-form video planning, ads.'
  },
  {
    id: 'local-demo-broll',
    name: 'Local Demo B-Roll',
    mediaType: 'video',
    status: 'workflow_required',
    localOnly: true,
    description: 'Turn generated stills or screenshots into subtle motion b-roll for ALPHONSO social content.',
    promptTemplate: 'Subtle cinematic camera movement across a futuristic local AI dashboard, calm glow, premium tech launch energy',
    recommendedUse: 'Reels/TikTok/YouTube Shorts backgrounds after image-to-video workflow is installed.'
  },
  {
    id: 'blank-spark',
    name: 'I Do Not Know What To Make Yet',
    mediaType: 'image',
    status: 'model_required',
    localOnly: true,
    description: 'A creative starter preset for users who want inspiration without knowing the exact asset yet.',
    promptTemplate: 'Create an unexpected but useful visual concept for promoting a local-first AI assistant product, bold composition, scroll-stopping, practical marketing use, clean premium design',
    recommendedUse: 'Idea generation, exploration, fast inspiration.'
  }
];

export function listMiyaComfyWorkflowPresets({ mediaType } = {}) {
  return MIYA_COMFY_WORKFLOW_PRESETS.filter((preset) => !mediaType || preset.mediaType === mediaType);
}

export function getMiyaComfyWorkflowPreset(presetId) {
  return MIYA_COMFY_WORKFLOW_PRESETS.find((preset) => preset.id === presetId) || null;
}
