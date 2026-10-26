// Preparing an Alphonso code step before it asks you (agent phase 6, owner 2026-10-26): which
// project, lock it, read it, let his code model write one change set, and classify it. Nothing
// is written here.
import { invoke } from '@tauri-apps/api/core';
import { generateAgentLlmResponse, withAgentModel } from '../../lib/ollama';
import { sanitizeRelativePath } from '../agentBrainService';
import { getAgentProvider } from '../modelSelectionService';
import { agentName } from '../jose/agentNames';
import { getJoseRequest } from '../jose/joseRequestStore';
import { refersToAProject } from '../jose/taskTypeMeanings';
import { getStepOutput } from '../jose/joseStepOutputs';
import { STEP_INPUT_LIMITS, skillSection, stepInputText, type StepInput } from '../jose/stepInput';
import { classifyCommand, classifyFile } from './changeSet';
import { parseCodeAnswer, type CodeAnswer } from './codeStep';
import { claimProject, busyLine, releaseProject } from './projectLock';
import {
  NO_PROJECT, getCodeModel, listProjects, projectNamedIn, projectPlace, scratchPlace, type WorkPlace,
} from './projects';
import { listProjectFiles, readProjectFiles } from './readProject';
import type { CodePreview } from './types';

export const ALPHONSO_NO_PLAN = "Alphonso's model didn't give a change he could use.";
export const WHICH_PROJECT = (names: string[]) => `Which project: ${names.join(', ')}?`;
export const FOLDER_GONE = (name: string, folder: string) => `The folder for ${name} is gone: ${folder}. Change it in Settings → Agents → Alphonso's projects.`;
export const MODEL_DIDNT_ANSWER = (why: string) => `Alphonso's model didn't answer (${why}). Nothing was changed.`;
export const NEEDS_TO_KNOW = (questions: string[]) => `Alphonso needs to know: ${questions.join(' ')}`;
const RECENT_SCRATCH = 10;

export type PrepareCode =
  | { ok: true; preview: CodePreview }
  | { ok: false; outcome: 'setup' | 'choose' | 'busy' | 'failed' | 'help'; reason: string; choices?: string[]; folder?: string };

type Assignment = { stepId?: string; agent?: string; actionType?: string; model?: string; revises?: string };

/** The model his code runs with: the step's own, else Settings, else Alphonso's ('' = his). */
export function codeModelFor(assignment: Assignment): string {
  return String(assignment?.model || getCodeModel() || '');
}

function largeModel(model: string): boolean {
  if (model.startsWith('claude:') || model.startsWith('chatgpt:')) return true;
  const provider = getAgentProvider('alphonso')?.provider;
  return Boolean(provider && provider !== 'ollama');
}

function outputFolder(): string {
  try { return String(JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.outputFolder || '').trim(); } catch { return ''; }
}

/** The newest scratch folders, so a follow-up request can reuse one. */
async function recentScratch(): Promise<string[]> {
  const root = outputFolder();
  if (!root) return [];
  try {
    const proof: any = await invoke('list_workspace_directory', { workspaceRoot: root, relativePath: agentName('alphonso'), recursive: false });
    const entries: any[] = Array.isArray(proof?.entries) ? proof.entries : [];
    return entries.filter((e) => e?.isDir).sort((a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0)).map((e) => String(e.name)).slice(0, RECENT_SCRATCH);
  } catch {
    return [];
  }
}

function scratchByName(name: string): WorkPlace | null {
  const root = outputFolder();
  if (!root) return null;
  const prefix = `${agentName('alphonso')}/${name}/`;
  return { kind: 'new', name, folder: `${root.replace(/[\\/]+$/, '')}/${prefix.replace(/\/$/, '')}`, root, prefix };
}

export async function askAlphonso(prompt: string, model: string): Promise<string> {
  const call = async () => String(((await generateAgentLlmResponse('alphonso', { prompt, format: 'json' })) as { response?: string } | null)?.response || '');
  return model ? withAgentModel('alphonso', model, call) : call();
}

/** Where the work goes: a saved choice, a project the request names, or his model's answer. */
async function choosePlace(requestText: string, requestStep: any, assignment: Assignment, model: string): Promise<WorkPlace | 'new' | Exclude<PrepareCode, { ok: true }>> {
  const projects = listProjects();
  if (requestStep?.project) {
    const saved = projects.find((p) => p.name.toLowerCase() === String(requestStep.project).toLowerCase());
    if (saved) return projectPlace(saved);
  }
  const named = projectNamedIn(requestText, projects);
  if (named) return projectPlace(named);
  const scratch = await recentScratch();
  const names = [...projects.map((p) => p.name), ...scratch];
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = [
      'You are Alphonso. Decide where this code request is done.',
      projects.length ? `Projects you may change: ${projects.map((p) => p.name).join(', ')}.` : 'No projects are listed.',
      scratch.length ? `Earlier small programs of yours: ${scratch.join(', ')}.` : '',
      `Request: ${requestText}`,
      problem,
      'Answer "new" when the request asks for a new small program, script or file of its own, not a change to one of the projects.',
      'Answer with JSON only: {"project": one of the names above, or "new" for a new small program, or "unknown" when the request is about a project but doesn\'t say which}.',
    ].filter(Boolean).join('\n\n');
    const raw = await askAlphonso(prompt, model);
    let project = '';
    try { project = String(JSON.parse((/\{[\s\S]*\}/.exec(raw) || ['{}'])[0])?.project || '').trim(); } catch { project = ''; }
    // A request about "this project" or "my app" is not a new program while projects are listed.
    if (project.toLowerCase() === 'new' && !(projects.length && refersToAProject(requestText))) return 'new';
    if (project.toLowerCase() === 'new') break;
    if (project.toLowerCase() === 'unknown') break;
    const listed = projects.find((p) => p.name.toLowerCase() === project.toLowerCase());
    // The request named no project: with several listed he asks which, never picks one (owner).
    if (listed && projects.length === 1) return projectPlace(listed);
    if (listed) break;
    const earlier = scratch.find((s) => s.toLowerCase() === project.toLowerCase());
    if (earlier) return scratchByName(earlier) || 'new';
    problem = `Your last answer "${project || 'nothing'}" is not one of the names. Choose one of: ${names.join(', ') || 'new, unknown'}.`;
  }
  if (projects.length === 1) return projectPlace(projects[0]);
  if (projects.length > 1) return { ok: false, outcome: 'choose', reason: WHICH_PROJECT(projects.map((p) => p.name)), choices: projects.map((p) => p.name) };
  return { ok: false, outcome: 'setup', reason: NO_PROJECT };
}

function codePrompt(requestText: string, place: WorkPlace, listing: string, files: { path: string; text: string }[], previous: { path: string; text: string }[], input: StepInput | null, problem: string, mayAskHelp: boolean): string {
  const shown = (list: { path: string; text: string }[]) => list.map((f) => `--- ${f.path}\n${f.text}`).join('\n\n');
  return [
    `You are Alphonso. You write code in ${place.kind === 'project' ? `the project "${place.name}"` : 'a new folder for a small program'}. You change only what the request needs, write complete files, and follow the project's style.`,
    input ? skillSection(input) : '',
    input ? stepInputText({ ...input, skill: null }) : '',
    `Request: ${requestText}`,
    listing ? `Files in the project:\n${listing}` : 'The folder is new and empty.',
    previous.length ? `Your files from the step you are fixing:\n${shown(previous)}` : '',
    files.length ? `Files you asked to read:\n${shown(files)}` : '',
    problem,
    [
      'Answer with JSON only:',
      '- "read": paths from the list you need to see first (only when you need them; then nothing else),',
      '- or "title" (a few words), "plan" (one or two sentences), "files" (each {"path": relative to the folder, "content": the whole file}), and "commands" (each {"program", "args", "why"}, the program alone and its arguments in args, e.g. {"program": "node", "args": ["hello.js"]}: only checks that prove the change works, or what the request asks to run; never a commit or a dev server unless the request asks),',
      'Write files only when the request asks for a change; a request to run something needs only "commands".',
      '- or "questions" (what you must know first) when you can\'t do it.',
      ...(mayAskHelp ? ['- or "help" (what another agent should find or check first, e.g. the docs of a library) when you need that before writing.'] : []),
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function safePath(raw: string): { path: string } | { reason: string } {
  if (/^[a-zA-Z]:/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) return { reason: 'Outside the project folder.' };
  if (raw.split(/[\\/]/).some((s) => s.toLowerCase() === '.git')) return { reason: "Inside .git, which Alphonso never changes." };
  if (raw.split(/[\\/]/).some((s) => /^\.{3,}$/.test(s))) return { reason: 'Not a file name.' };
  const clean = sanitizeRelativePath(raw);
  return clean ? { path: clean } : { reason: 'Outside the project folder.' };
}

async function readWhole(place: WorkPlace, path: string): Promise<string | null> {
  try {
    const proof: any = await invoke('read_workspace_file', { workspaceRoot: place.root, relativePath: `${place.prefix}${path}` });
    return typeof proof?.content === 'string' ? proof.content : null;
  } catch {
    return null;
  }
}

/** The commands the app's command policy would refuse, with its reason (agent phase 6). */
async function policyRefusals(commands: CodeAnswer['commands']): Promise<{ line: string; reason: string }[]> {
  const refused: { line: string; reason: string }[] = [];
  for (const c of commands) {
    try {
      const answer: any = await invoke('command_allowed', { program: c.program, args: c.args });
      if (answer && answer.allowed === false) refused.push({ line: [c.program, ...c.args].join(' '), reason: String(answer.reason || '') });
    } catch { /* outside the desktop app: the run itself checks */ }
  }
  return refused;
}

/** Prepares the step; a failure after the project was claimed frees it again. */
export async function prepareAlphonsoCode(commandId: string, assignment: Assignment, requestId: string, input: StepInput | null): Promise<PrepareCode> {
  const claimed: string[] = [];
  let result: PrepareCode;
  try {
    result = await prepare(commandId, assignment, requestId, input, claimed);
  } catch (error) {
    result = { ok: false, outcome: 'failed', reason: MODEL_DIDNT_ANSWER(error instanceof Error ? error.message : String(error)) };
  }
  if (result.ok === false && result.outcome !== 'busy') for (const folder of claimed) releaseProject(folder, requestId);
  return result;
}

async function prepare(commandId: string, assignment: Assignment, requestId: string, input: StepInput | null, claimed: string[]): Promise<PrepareCode> {
  const request: any = getJoseRequest(requestId);
  const requestText = String(request?.text || input?.request || '');
  const requestStep = request?.steps?.find((s: any) => s.stepId === assignment.stepId) || null;
  const model = codeModelFor(assignment);
  const large = largeModel(model);
  const listChars = large ? STEP_INPUT_LIMITS.largeChars : STEP_INPUT_LIMITS.localChars;

  // A fix round continues the step it revises, in the same place, from its files.
  let previousPaths: string[] = [];
  let place: WorkPlace | 'new' | Exclude<PrepareCode, { ok: true }>;
  const revised = assignment.revises ? request?.steps?.find((s: any) => s.stepId === assignment.revises) : null;
  if (revised?.codePreview?.place) {
    place = revised.codePreview.place as WorkPlace;
    previousPaths = ((getStepOutput(commandId, assignment.revises!) as any)?.artifacts || [])
      .filter((a: any) => a?.type === 'code_file' && a.relativePath).map((a: any) => String(a.relativePath));
  } else {
    place = await choosePlace(requestText, requestStep, assignment, model);
  }
  if (typeof place === 'object' && 'ok' in place) return place;

  let listing = '';
  if (place !== 'new') {
    const lock = claimProject(place.folder, requestId);
    if (lock.ok === false) return { ok: false, outcome: 'busy', reason: busyLine(place.name), folder: place.folder };
    claimed.push(place.folder);
    try {
      listing = (await listProjectFiles(place.folder, listChars)).text;
    } catch {
      // A new program's folder exists only once something is written to it.
      if (place.kind !== 'new') return { ok: false, outcome: 'setup', reason: FOLDER_GONE(place.name, place.folder) };
      listing = '';
    }
  }
  const workPlace: WorkPlace = place === 'new'
    ? { kind: 'new', name: 'new', folder: '', root: '', prefix: '' }
    : place;
  const previous = previousPaths.length && place !== 'new' ? await readProjectFiles(place.folder, previousPaths, large) : [];

  let answer: CodeAnswer | null = null;
  let read: { path: string; text: string }[] = [];
  let problem = '';
  let readAsked = false;
  let refusedCommands: { line: string; reason: string }[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await askAlphonso(codePrompt(requestText, workPlace, listing, read, previous, input, problem, !(assignment as any).helpRound), model);
    const parsed = parseCodeAnswer(raw);
    if (!parsed) {
      problem = 'Your last answer could not be read as the JSON asked for.';
      continue;
    }
    if (parsed.help && !parsed.files.length) return { ok: false, outcome: 'help', reason: parsed.help };
    if (!parsed.files.length && !parsed.questions.length && parsed.read.length && !readAsked && place !== 'new') {
      readAsked = true;
      const known = new Set(listing.split('\n'));
      read = await readProjectFiles(place.folder, parsed.read.filter((p) => known.has(p)), large);
      attempt -= 1;
      continue;
    }
    // A program that is one of the files: the model ran the file itself (live run, 2026-10-26).
    const fileNames = new Set([...parsed.files.map((f) => f.path), ...listing.split('\n')].map((p) => p.trim()).filter(Boolean));
    const fileAsProgram = parsed.commands.find((c) => fileNames.has(c.program));
    if (fileAsProgram && attempt === 0) {
      problem = `${fileAsProgram.program} is a file, not a program: name the program that runs it in "program" and the file in "args".`;
      continue;
    }
    // A command the app would refuse is sent back once with the reason, then left out.
    const refused = await policyRefusals(parsed.commands);
    if (refused.length && attempt === 0) {
      problem = refused.map((r) => `${r.line} isn't allowed here: ${r.reason}`).join('\n') + '\nUse a command the app allows instead, or leave it out.';
      continue;
    }
    refusedCommands = refused;
    answer = parsed;
    break;
  }
  if (!answer || (!answer.files.length && !answer.commands.length && !answer.questions.length)) return { ok: false, outcome: 'failed', reason: ALPHONSO_NO_PLAN };
  if (answer.questions.length) return { ok: false, outcome: 'failed', reason: NEEDS_TO_KNOW(answer.questions) };

  let finalPlace: WorkPlace;
  if (place === 'new') {
    const scratch = scratchPlace(answer.title || answer.plan || 'new program', await recentScratch());
    if ('ok' in scratch) return { ok: false, outcome: 'setup', reason: scratch.reason };
    const lock = claimProject(scratch.folder, requestId);
    if (lock.ok === false) return { ok: false, outcome: 'busy', reason: busyLine(scratch.name), folder: scratch.folder };
    claimed.push(scratch.folder);
    finalPlace = scratch;
  } else {
    finalPlace = place;
  }

  const dropped: { path: string; reason: string }[] = [];
  const files = [];
  for (const file of answer.files) {
    const checked = safePath(file.path);
    if ('reason' in checked) { dropped.push({ path: file.path, reason: checked.reason }); continue; }
    const before = finalPlace.kind === 'project' || place !== 'new' ? await readWhole(finalPlace, checked.path) : null;
    if (before !== null && before === file.content) continue;
    files.push(classifyFile(checked.path, file.content, before));
  }
  const preview: CodePreview = {
    place: finalPlace,
    plan: answer.plan,
    title: answer.title,
    files,
    commands: answer.commands
      .filter((c) => !refusedCommands.some((r) => r.line === [c.program, ...c.args].join(' ')))
      .map((c) => classifyCommand(c.program, c.args, c.why)),
    dropped: [...dropped, ...refusedCommands.map((r) => ({ path: r.line, reason: `The app doesn't allow this command: ${r.reason}` }))],
    model,
    preparedAtMs: Date.now(),
  };
  return { ok: true, preview };
}
