import React, { useState } from 'react';
import type { StudioData } from '../../services/phone/remoteData';
import type { PhoneProject } from '../../services/phone/contentMirror';
import type { PhoneLock } from '../MobileApp';
import { STEP_ORDER, type StepId } from '../../services/contentFactory/contentTypes';
import { STEP_LABELS, STATUS_TEXT } from '../../components/miya/stepWords';
import { postStamp, postsStamp, stepStamp } from '../../services/phone/contentStamps';
import { confirmLockedCall } from '../lockedApproval';
import { PreviewPlayer } from './PreviewPlayer';

const EDITABLE = new Set(['draft']);
const btn = 'rounded-lg px-3 py-1 text-xs disabled:opacity-50';

/** One project on the phone: its steps and versions, the reviews to approve, the media, the posts. */
export function StudioProject({ studio, project, lock, onBack }: { studio: StudioData; project: PhoneProject; lock: PhoneLock; onBack: () => void }) {
  const [shown, setShown] = useState<PhoneProject>(project);
  const [message, setMessage] = useState('');
  const [sendingBack, setSendingBack] = useState<{ step: StepId; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, { title: string; caption: string; hashtags: string }>>({});
  const [busy, setBusy] = useState(false);
  // A newer copy from the computer replaces what was shown.
  if (project.updatedAtMs > shown.updatedAtMs && project !== shown) setShown(project);
  const off = busy || studio.readOnly;

  const act = async (name: Parameters<StudioData['call']>[0], args: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await studio.call(name, { projectId: shown.id, ...args });
    setBusy(false);
    if (r.ok === false) { setMessage(r.reason); return; }
    if (r.value?.latest) setShown(r.value.latest);
    setMessage(r.value?.stale ? r.value.message : done);
  };

  const steps = STEP_ORDER.filter((id) => shown.steps?.[id] && shown.steps[id].status !== 'not_started');
  const drafts = (shown.posts || []).filter((p) => EDITABLE.has(p.status));
  const editOf = (id: string, post: { title: string; caption: string; hashtags: string[] }) => edits[id] || { title: post.title || '', caption: post.caption || '', hashtags: (post.hashtags || []).join(' ') };

  return (
    <div className="space-y-4 pt-2 text-sm" data-testid="studio-project">
      <button type="button" onClick={onBack} className="text-xs text-(--accent)">‹ All projects</button>
      <h2 className="text-base font-semibold">{shown.name}</h2>
      {studio.readOnlyReason && <p className="text-xs text-(--text-3)">{studio.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}

      <section className="space-y-2">
        {steps.map((id) => {
          const state = shown.steps[id];
          const base = stepStamp(shown, id);
          return (
            <div key={id} className="rounded-xl bg-(--surface-2) p-3">
              <div className="flex justify-between"><span className="font-medium">{STEP_LABELS[id]}</span><span className="text-xs text-(--text-2)">{STATUS_TEXT[state.status]}</span></div>
              {state.versions.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {state.versions.map((v) => (
                    v.version === state.chosenVersion
                      ? <span key={v.version} className={`${btn} bg-(--accent-dim)`}>v{v.version} (in use)</span>
                      : <button key={v.version} type="button" data-testid={`studio-use-${id}-${v.version}`} disabled={off} className={`${btn} bg-(--surface-3)`}
                        onClick={() => act('content.chooseVersion', { step: id, version: v.version, base }, `Using v${v.version}.`)}>Use v{v.version}</button>
                  ))}
                </div>
              )}
              {state.status === 'needs_approval' && (
                <div className="mt-2 flex gap-2">
                  <button type="button" data-testid={`studio-approve-${id}`} disabled={off} className={`${btn} bg-(--accent) text-white`}
                    onClick={() => act('content.approveStep', { step: id, base }, 'Approved.')}>Approve</button>
                  <button type="button" data-testid={`studio-send-back-${id}`} disabled={off} className={`${btn} bg-(--surface-3)`}
                    onClick={() => setSendingBack({ step: id, text: '' })}>Send back</button>
                </div>
              )}
              {sendingBack?.step === id && (
                <div className="mt-2 space-y-2">
                  <textarea aria-label="What to change" value={sendingBack.text} onChange={(e) => setSendingBack({ step: id, text: e.target.value })} rows={2} className="w-full rounded-lg border border-(--border) px-2 py-1" />
                  <button type="button" disabled={off || !sendingBack.text.trim()} className={`${btn} bg-(--accent) text-white`}
                    onClick={() => { const text = sendingBack.text.trim(); setSendingBack(null); void act('content.sendBack', { step: id, reason: text, base }, 'Sent back. Miya works on it again.'); }}>Send it back</button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {shown.media?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-(--text-3)">Pictures and videos</h3>
          {shown.media.map((m) => <PreviewPlayer key={m.path} studio={studio} mediaRef={m} />)}
        </section>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-(--text-3)">Posts</h3>
          {drafts.map((post) => {
            const e = editOf(post.id, post);
            const set = (patch: Partial<typeof e>) => setEdits({ ...edits, [post.id]: { ...e, ...patch } });
            const name = `${post.platform} ${post.piece}`;
            return (
              <div key={post.id} className="space-y-1 rounded-xl bg-(--surface-2) p-3">
                {post.platform === 'youtube' && <input aria-label={`Title: ${name}`} value={e.title} onChange={(ev) => set({ title: ev.target.value })} className="w-full rounded-lg border border-(--border) px-2 py-1" />}
                <textarea aria-label={`Caption: ${name}`} value={e.caption} onChange={(ev) => set({ caption: ev.target.value })} rows={3} className="w-full rounded-lg border border-(--border) px-2 py-1" />
                <input aria-label={`Hashtags: ${name}`} value={e.hashtags} onChange={(ev) => set({ hashtags: ev.target.value })} className="w-full rounded-lg border border-(--border) px-2 py-1" />
                <button type="button" data-testid={`studio-save-post-${post.id}`} disabled={off} className={`${btn} bg-(--surface-3)`}
                  onClick={() => act('content.editPost', {
                    postId: post.id, caption: e.caption, hashtags: e.hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean),
                    ...(post.platform === 'youtube' ? { title: e.title } : {}), base: postStamp(post),
                  }, 'Saved.')}>Save</button>
              </div>
            );
          })}
          <button type="button" disabled={off} className="rounded-lg bg-(--accent) px-4 py-2 text-white"
            onClick={async () => {
              const refused = await confirmLockedCall('content.approvePosts', 'Approve and schedule the posts', lock);
              if (refused) { setMessage(refused); return; }
              await act('content.approvePosts', { base: postsStamp(shown) }, 'Approved. Marcus schedules the posts.');
            }}>Approve and schedule</button>
        </section>
      )}
    </div>
  );
}
