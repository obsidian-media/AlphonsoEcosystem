// The board groups a project's requests (Jose phase 7, owner 2026-10-27): each "Run this step"
// stays its own request, but a project's requests are shown together under its name, newest
// first, where the newest of them falls in the list. Requests without a group stand alone.
import type { JoseRequest } from './joseRequestStore';

export interface RequestGroup {
  group: { id: string; label: string } | null;
  requests: JoseRequest[];
}

/** Requests in board order (newest first), each project's together. */
export function groupRequests(requests: JoseRequest[]): RequestGroup[] {
  const sorted = [...requests].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const out: RequestGroup[] = [];
  const byGroup = new Map<string, RequestGroup>();
  for (const request of sorted) {
    const group = request.group;
    if (!group?.id) {
      out.push({ group: null, requests: [request] });
      continue;
    }
    const existing = byGroup.get(group.id);
    if (existing) {
      existing.requests.push(request);
      continue;
    }
    const entry: RequestGroup = { group: { id: group.id, label: group.label }, requests: [request] };
    byGroup.set(group.id, entry);
    out.push(entry);
  }
  return out;
}
