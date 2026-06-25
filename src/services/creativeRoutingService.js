
const CREATIVE_PATTERNS = {
  image_generation: /\b(generate|create|draw|make|render)\b.{0,30}\b(image|photo|picture|illustration|artwork|poster|thumbnail)\b/i,
  video_generation: /\b(generate|create|make|produce)\b.{0,30}\b(video|short|reel|clip|animation|film)\b/i,
  audio_generation: /\b(generate|create|make|produce)\b.{0,30}\b(audio|music|sound|voice|song|track)\b/i,
};

const TOOL_PRIORITY = {
  image_generation: ['comfyui', 'automatic1111', 'fooocus', 'invokeai'],
  video_generation: ['moneyprinter'],
  audio_generation: ['audiocraft', 'whisper'],
};

export function detectCreativeIntent(commandText) {
  for (const [intent, pattern] of Object.entries(CREATIVE_PATTERNS)) {
    if (pattern.test(commandText)) return intent;
  }
  return null;
}

export async function routeToCreativeTool(intent) {
  let statuses;
  try {
    const { getAllStatus } = await import('./runtimeManagerService');
    statuses = await getAllStatus();
  } catch { return null; }
  const running = (statuses || []).filter(s => s.status === 'running').map(s => s.name);
  const preferred = TOOL_PRIORITY[intent] || [];
  const tool = preferred.find(t => running.includes(t));
  if (!tool) {
    return {
      ok: false,
      error: `No ${intent.replace('_', ' ')} tool is running. Start one in Runtime Hub.`,
      needsRuntime: true,
    };
  }
  return { ok: true, tool };
}
