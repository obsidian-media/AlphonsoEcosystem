// Running an approved Alphonso code step (agent phase 6): write exactly what you approved, run
// exactly those commands, fix within that set for at most JOSE_LIMITS.maxFixRounds, and say
// plainly what passed, failed or didn't run. No runtime proof, no confidence score.
import { invoke } from '@tauri-apps/api/core';
import { writeWorkspaceArtifact } from '../workspaceArtifactService';
import { verifyCommandExecution } from '../verificationService';
import { pushMemoryItem } from '../unifiedMemoryService';
import { TRUST_STATES } from '../trustModel';
import { JOSE_LIMITS } from '../jose/stepGraph';
import { STEP_INPUT_LIMITS, stepInputText, type StepInput } from '../jose/stepInput';
import { FILE_LIMITS } from '../maria/workContext';
import { contentHash } from './changeSet';
import { parseCodeAnswer } from './codeStep';
import { askAlphonso } from './prepareCode';
import { releaseProject } from './projectLock';
import type { CodeCommand, CodePreview } from './types';

export interface CommandRun { command: CodeCommand; exitCode: number | null; ok: boolean; tail: string }

const line = (c: CodeCommand) => [c.program, ...c.args].join(' ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function readCurrent(p: CodePreview, path: string): Promise<string | null> {
  try {
    const proof: any = await invoke('read_workspace_file', { workspaceRoot: p.place.root, relativePath: `${p.place.prefix}${path}` });
    return typeof proof?.content === 'string' ? proof.content : null;
  } catch {
    return null;
  }
}

async function write(p: CodePreview, path: string, content: string): Promise<void> {
  await writeWorkspaceArtifact({ workspaceRoot: p.place.root, relativePath: `${p.place.prefix}${path}`, content });
}

/** Writes the approved files; a changed file whose content moved on since the preview is refused. */
export async function applyChangeSet(p: CodePreview): Promise<{ written: string[]; refused: { path: string; reason: string }[] }> {
  const written: string[] = [];
  const refused: { path: string; reason: string }[] = [];
  for (const file of p.files) {
    if (file.status === 'changed') {
      const now = await readCurrent(p, file.path);
      if (now === null || contentHash(now) !== file.beforeHash) {
        refused.push({ path: file.path, reason: 'it changed since the preview' });
        continue;
      }
    }
    try {
      await write(p, file.path, file.content);
      written.push(file.path);
    } catch (error) {
      refused.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { written, refused };
}

export async function runApprovedCommands(p: CodePreview, commands: CodeCommand[] = p.commands): Promise<CommandRun[]> {
  const runs: CommandRun[] = [];
  for (const command of commands) {
    const proof: any = await verifyCommandExecution(command.program, command.args, p.place.folder);
    const payload = proof?.payload || {};
    const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
    const output = String(payload.stderr || payload.stdout || '');
    runs.push({ command, exitCode, ok: payload.success === true || exitCode === 0, tail: output.slice(-FILE_LIMITS.eachChars) });
  }
  return runs;
}

function fixPrompt(p: CodePreview, failed: CommandRun[], current: { path: string; text: string }[], input: StepInput | null): string {
  return [
    'You are Alphonso. Your change was written, but a check failed. Fix it.',
    input ? stepInputText({ ...input, skill: null }) : '',
    `Your plan: ${p.plan}`,
    `Failed checks:\n${failed.map((r) => `${line(r.command)} (exit ${r.exitCode ?? 'unknown'}):\n${r.tail}`).join('\n\n')}`,
    `Your files now:\n${current.map((f) => `--- ${f.path}\n${f.text}`).join('\n\n')}`,
    `You may change only these files or add new ones: ${p.files.map((f) => f.path).join(', ')}. The same checks run again.`,
    'Answer with JSON only: {"files": [{"path": "...", "content": "the whole file"}]}',
  ].filter(Boolean).join('\n\n');
}

export async function runAlphonsoCode(commandId: string, assignment: any, preview: CodePreview, input: StepInput | null) {
  const requestId = `jose-request-${commandId}`;
  const base = { resultUrl: null, sources: [], contractAction: assignment?.actionType || 'local_operation' };
  try {
    const { written, refused } = await applyChangeSet(preview);
    let runs = await runApprovedCommands(preview);
    const notDone = new Set<string>();
    const approvedPaths = new Set(preview.files.map((f) => f.path));
    for (let round = 0; round < JOSE_LIMITS.maxFixRounds && runs.some((r) => !r.ok); round += 1) {
      const current = await Promise.all(preview.files.map(async (f) => ({ path: f.path, text: String(await readCurrent(preview, f.path) ?? '').slice(0, FILE_LIMITS.eachChars) })));
      const answer = parseCodeAnswer(await askAlphonso(fixPrompt(preview, runs.filter((r) => !r.ok), current, input), preview.model));
      for (const file of answer?.files || []) {
        const exists = (await readCurrent(preview, file.path)) !== null;
        if (!approvedPaths.has(file.path) && exists) { notDone.add(`change ${file.path}`); continue; }
        await write(preview, file.path, file.content);
        if (!written.includes(file.path)) written.push(file.path);
      }
      runs = await runApprovedCommands(preview);
    }

    const changed = new Set(preview.files.filter((f) => f.status === 'changed').map((f) => f.path));
    const newOnes = written.filter((p) => !changed.has(p));
    const changedOnes = written.filter((p) => changed.has(p));
    const parts: string[] = [];
    if (newOnes.length) parts.push(`Wrote ${plural(newOnes.length, 'file')} in ${preview.place.name}: ${newOnes.join(', ')}.`);
    if (changedOnes.length) parts.push(`Changed ${changedOnes.join(', ')}.`);
    for (const r of refused) parts.push(`${r.path} was not written: ${r.reason}.`);
    for (const d of preview.dropped) parts.push(`${d.path} was left out: ${d.reason}`);
    for (const r of runs) parts.push(r.ok ? `${line(r.command)}: passed.` : `${line(r.command)}: failed: ${r.tail.trim().slice(-STEP_INPUT_LIMITS.otherLineChars)}`);
    if (notDone.size) parts.push(`Needs your approval: ${[...notDone].join(', ')}.`);
    if (preview.place.kind === 'new' && written.length) parts.push(`Folder: ${preview.place.folder}`);

    const checks = runs.length ? (runs.every((r) => r.ok) ? 'passed' : 'failed') : 'none';
    const ok = !refused.length && runs.every((r) => r.ok);
    pushMemoryItem({
      title: `Alphonso: ${preview.plan || preview.title} — ${plural(written.length, 'file')}, checks ${checks}`,
      category: 'code_generation',
      content: { plan: preview.plan, place: preview.place.name, files: written, checks: runs.map((r) => ({ command: line(r.command), ok: r.ok, exitCode: r.exitCode })) },
      source: 'alphonso-code-step',
      sourceAgent: 'alphonso',
      confidence: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.INFERRED,
      verificationState: ok ? TRUST_STATES.VERIFIED : TRUST_STATES.UNVERIFIED,
    });
    return {
      ...base,
      summary: parts.join(' ') || `Nothing changed in ${preview.place.name}.`,
      resultState: ok ? 'completed' : 'failed',
      artifacts: [
        ...written.map((p) => ({ type: 'code_file', relativePath: `${preview.place.prefix}${p}`, status: changed.has(p) ? 'changed' : 'new' })),
        ...runs.map((r) => ({ type: 'command_result', program: r.command.program, args: r.command.args, exitCode: r.exitCode, ok: r.ok })),
      ],
    };
  } catch (error) {
    return { ...base, summary: `Alphonso's change could not be applied: ${error instanceof Error ? error.message : String(error)}`, resultState: 'failed', artifacts: [] };
  } finally {
    releaseProject(preview.place.folder, requestId);
  }
}
