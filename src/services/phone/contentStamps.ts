// What a phone change was based on (phone app, phase 2). The phone sends the stamp of what it
// saw; the computer refuses the change when its own stamp differs ("This changed on your
// computer; here's the latest."). Only the fields a phone change depends on are stamped, so
// a step's progress line elsewhere in the project never makes a phone edit stale. Shared by
// the computer (contentCalls.ts) and the phone's screens.

type StepLike = { status?: unknown; chosenVersion?: unknown; versions?: Array<{ version?: unknown }> };
type PostLike = { id?: unknown; title?: unknown; caption?: unknown; hashtags?: unknown; scheduledAtMs?: unknown; status?: unknown };
type ProjectLike = { steps?: Record<string, StepLike | undefined>; posts?: PostLike[] };

export function stepStamp(project: ProjectLike, step: string): string {
  const s = project.steps?.[step];
  return JSON.stringify([s?.status ?? null, s?.chosenVersion ?? null, (s?.versions || []).map((v) => v.version)]);
}

export function postStamp(post: PostLike): string {
  return JSON.stringify([post.title ?? '', post.caption ?? '', post.hashtags ?? [], post.scheduledAtMs ?? null, post.status ?? null]);
}

export function postsStamp(project: ProjectLike): string {
  return JSON.stringify((project.posts || []).map((p) => [p.id, postStamp(p)]));
}
