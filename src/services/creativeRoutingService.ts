// "short", "track", "voice" and "sound" were dropped from these: they matched
// ordinary requests ("create a short summary", "make a tracker") and Jose then
// refused them as video or audio jobs (QA, 2026-10-22). "YouTube short(s)" is
// still a video.
const CREATIVE_PATTERNS: Record<string, RegExp> = {
  image_generation: /\b(generate|create|draw|make|render)\b.{0,30}\b(image|photo|picture|illustration|artwork|poster|thumbnail)\b/i,
  video_generation: /\b(generate|create|make|produce)\b.{0,30}\b(video|reel|clip|animation|film|youtube shorts?)\b/i,
  audio_generation: /\b(generate|create|make|produce)\b.{0,30}\b(audio|music|song|soundtrack|sound effects?|voiceover|podcast)\b/i,
};

// Owner, 2026-10-22: agents make images with ComfyUI only. Automatic1111,
// Fooocus and InvokeAI stay in Runtime Hub as standalone tools; they are not
// API-compatible with each other, so routing to them failed anyway.
const IMAGE_TOOL = 'comfyui';

// Video and music are Miya's own step (contentFactory/chatMedia.ts, closing phase 2026-10-30),
// asked by submitToJose() before the shortcuts; this route only finds the picture tool.

interface RouteResult {
  ok: boolean;
  tool?: string;
  error?: string;
  needsRuntime?: boolean;
  /** The request type exists but chat can't do it yet. */
  notAvailable?: boolean;
}

export function detectCreativeIntent(commandText: string): string | null {
  // Asked for Higgsfield by name (phase 4b): its own paid step, before the general requests.
  if (/\bhiggsfield\b/i.test(commandText) && /\b(make|create|generate|render|draw|produce)\b/i.test(commandText)) {
    return /\b(video|clip|reel|animation|film)s?\b/i.test(commandText) ? 'higgsfield_video' : 'higgsfield_picture';
  }
  for (const [intent, pattern] of Object.entries(CREATIVE_PATTERNS)) {
    if (pattern.test(commandText)) return intent;
  }
  return null;
}

export async function routeToCreativeTool(intent: string): Promise<RouteResult | null> {
  if (intent !== 'image_generation') return null;
  let statuses: Array<{ name: string; status?: string; running?: boolean }> | undefined;
  try {
    const { getAllStatus } = await import('./runtimeManagerService');
    statuses = await getAllStatus();
  } catch { return null; }
  const comfy = (statuses || []).find((s) => s.name === IMAGE_TOOL);
  if (comfy && (comfy.running || comfy.status === 'running')) return { ok: true, tool: IMAGE_TOOL };
  return {
    ok: false,
    error: 'ComfyUI is not running. Start it in Runtime Hub; it is the image tool Alphonso uses.',
    needsRuntime: true,
  };
}
