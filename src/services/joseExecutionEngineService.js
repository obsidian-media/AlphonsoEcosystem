import { appendAgentActivity } from './agentActivityService';
import { invoke } from '@tauri-apps/api/core';
import {
  AGENTS,
  approvePacket,
  attemptPacketExecution,
  getPacketById,
  requestPacketRetry,
  updatePacketStatus
} from './agentBusService';
import {
  confirmJoseCommand,
  createAgentReportToJose,
  createJoseCommandRoute,
  listJoseCommands
} from './joseCommandRouterService';
import { pushMemoryItem, listMemoryItems } from './memoryService';
import { pushMiyaMemory } from './miyaMemoryService';
import { listMiyaComfyWorkflowPresets } from './miyaComfyWorkflowPresetService';
import { listMiyaWorkflowTemplates, getMiyaWorkflowTemplate } from './miyaWorkflowTemplates';
import { appendSessionEvent } from './sessionIntelligenceService';
import { runHectorLiveResearch, createResearchDraft } from './hectorResearchService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { verifyOllamaRuntimeProof, verifyProcessProof, verifyCommandExecution } from './verificationService';
import { classifyMissionRoomRisk, redactMissionRoomSecrets } from './missionRoomService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { recordOrchestrationQueueTransition } from './orchestrationQueueService';
import { persistScopeRows } from './runtimeLedgerService';
import { setAgentOutput, getPriorOutputs, buildExecutionPlan } from './agentOutputStoreService';
import { shouldBlock as sentinelShouldBlock, checkSentinelAlerts } from './sentinelGateService';
import { storeNovaScore, getDecompositionHints } from './novaFeedbackService';
import { loadAgentSkillGuidance } from './skillPackService';
import { writeWorkspaceArtifact } from './workspaceArtifactService';
import { getProjectDirectoryPath } from './projectDirectoryService';
import { scaffoldProject, detectStackTemplate } from './scaffoldTemplatesService';
import { generateOllamaResponse, fetchOllamaModels, PREFERRED_MODEL } from '../lib/ollama';
import { generateComfyUiImage, generateSdWebUiImage } from './connectorRegistryService';
import { runContentCatalystJob, createContentBridgeRequest } from '../features/content-catalyst/services/contentCatalystService';
import { createProjectGoal, generateBatch, advanceToNextBatch, getActiveGoal, getActiveBatch, getBatchProgress, executeBatch, getGoalById } from './batchOrchestratorService';

export function isJoseIntakeCommand(text) {
  return /^(\/jose\b|ask\s+jose\b|jose[:\s])/i.test(String(text || '').trim());
}

function isContentCatalystRequest(text) {
  const lower = String(text || '').toLowerCase();
  return /(?:create|make|generate|build|write|design)\s+(?:a\s+)?(?:content|post|social|marketing|campaign|ad|advertisement|promo|blog|article|newsletter)/i.test(lower)
    || /(?:instagram|facebook|twitter|tiktok|linkedin|youtube)\s+(?:post|content|video|reel|story)/i.test(lower)
    || /(?:content\s+catalyst|content\s+pipeline)/i.test(lower);
}

function parseContentCatalystRequest(commandText) {
  const text = String(commandText || '').trim();
  const platformMatch = text.match(/(instagram|facebook|twitter|tiktok|linkedin|youtube)/i);
  const platform = platformMatch ? platformMatch[1].toLowerCase() : 'instagram';
  const formatMatch = text.match(/(post|reel|story|video|blog|article|newsletter|ad|campaign)/i);
  const format = formatMatch ? formatMatch[1].toLowerCase() : 'post';
  const needsVideo = /video|reel|animation|motion/i.test(text);
  const needsNarration = /narrat|voiceover|speak|audio/i.test(text);
  const needsPublish = /publish|post|upload|go\s*live/i.test(text);
  const idea = text
    .replace(/(?:create|make|generate|build|write|design)\s+(?:a\s+)?/i, '')
    .replace(/(?:content|post|social|marketing|campaign|ad|advertisement|promo|blog|article|newsletter)\s*(?:for|about|on|regarding)?\s*/i, '')
    .replace(/(instagram|facebook|twitter|tiktok|linkedin|youtube)\s*/i, '')
    .replace(/(post|reel|story|video|blog|article|newsletter|ad|campaign)\s*/i, '')
    .trim()
    .slice(0, 200) || text.slice(0, 200);
  return {
    idea,
    platform,
    format,
    tone: 'confident and polished',
    needs: {
      image: true,
      video: needsVideo,
      narration: needsNarration,
      publish: needsPublish
    }
  };
}

function isRiskyAssignment(assignment) {
  const risk = String(assignment?.riskLevel || '').toLowerCase();
  const action = String(assignment?.actionType || '').toLowerCase();
  return risk === 'high' || risk === 'critical' || /external_publish|publish|upload|post/.test(action);
}

function isBlockedByZeroCostMode(packet, assignment) {
  const policy = packet?.payload?.policy || {};
  if (!policy?.zeroCostMode) return false;
  if (policy?.blockedByZeroCostMode) return true;
  const costClass = String(policy?.costClass || assignment?.costClass || '').toLowerCase();
  return costClass === 'paid_or_metered';
}

function extractNovaScore(result) {
  if (!result) return null;
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  const scoreArtifact = artifacts.find((a) => a?.type === 'opportunity_score');
  if (scoreArtifact) {
    const opportunity = Number(scoreArtifact.opportunityScore ?? scoreArtifact.score ?? 50);
    const risk = Number(scoreArtifact.riskScore ?? 0);
    return { opportunityScore: opportunity, riskScore: risk, score: opportunity };
  }
  return null;
}

function checkSentinelGate(commandId, assignment) {
  const risk = String(assignment?.riskLevel || '').toLowerCase();
  if (risk !== 'high' && risk !== 'critical') {
    return { blocked: false, reason: '' };
  }
  const sentinelAlerts = checkSentinelAlerts(commandId);
  if (!sentinelAlerts.found) {
    return { blocked: false, reason: '' };
  }
  const blockResult = sentinelShouldBlock(assignment, sentinelAlerts.output);
  return blockResult;
}

export function draftPrompt(agent, task, context = {}) {
  const taskText = String(task || '').trim();
  const contextSnippet = String(context?.snippet || '').trim();
  const skillGuidance = loadAgentSkillGuidance(agent);
  const skillContext = skillGuidance.recommendedSteps.length > 0
    ? `\nActive skill workflow: ${skillGuidance.recommendedSteps.join(' → ')}.\nSkill guidance: ${skillGuidance.guidance.map((g) => g.guidance).join(' ')}`
    : '';

  if (agent === 'miya') {
    return [
      'You are Miya, a creative director for a local AI desktop companion.',
      'Generate a structured creative package as JSON with these keys:',
      '"title" (string, max 120 chars), "hook" (string), "script" (multi-line string),',
      '"scenes" (array of 2-4 scene strings), "prompts" (array of 2-3 image/video prompt strings).',
      '',
      'Task:',
      taskText,
      contextSnippet ? `Context: ${contextSnippet}` : '',
      skillContext,
      '',
      'Return ONLY valid JSON, no markdown fences.'
    ].filter(Boolean).join('\n');
  }

  if (agent === 'hector') {
    return [
      'You are Hector, a research analyst for a local AI desktop companion.',
      'Summarize the following research task into a concise briefing.',
      'Include: key findings, recommended sources, risk notes.',
      '',
      'Task:',
      taskText,
      contextSnippet ? `Prior context: ${contextSnippet}` : '',
      skillContext,
      '',
      'Return plain text, 2-4 paragraphs.'
    ].filter(Boolean).join('\n');
  }

  if (agent === 'alphonso') {
    return [
      'You are Alphonso, the local operator agent for a desktop AI companion.',
      'You can execute commands (npm, git, node), write files, and build projects.',
      'When asked to build something, plan the file structure, generate the code, and write each file.',
      '',
      'Task:',
      taskText,
      contextSnippet ? `Context: ${contextSnippet}` : '',
      skillContext,
      '',
      'Return a JSON object with:',
      '"plan" (string — what you will do),',
      '"files" (array of {path, content} objects to write),',
      '"commands" (array of {program, args} objects to execute),',
      '"summary" (string — what was accomplished).',
      '',
      'Return ONLY valid JSON, no markdown fences.'
    ].filter(Boolean).join('\n');
  }

  return `You are an AI assistant helping with: ${taskText}${skillContext}`;
}

export function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1] : trimmed;
  return JSON.parse(raw);
}

export function retrieveRelevantContext(text, memoryItems = []) {
  const query = String(text || '').toLowerCase().trim();
  if (!query || !Array.isArray(memoryItems) || memoryItems.length === 0) {
    return { snippet: '', items: [] };
  }

  const queryWords = query.split(/\s+/).filter((w) => w.length > 3);
  if (queryWords.length === 0) {
    return { snippet: '', items: [] };
  }

  const scored = memoryItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const title = String(item.title || '').toLowerCase();
      const content = String(typeof item.content === 'string' ? item.content : '').toLowerCase();
      const category = String(item.category || '').toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (title.includes(word)) score += 3;
        if (content.includes(word)) score += 1;
        if (category.includes(word)) score += 1;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return { snippet: '', items: [] };
  }

  const items = scored.map((entry) => ({
    id: entry.item.id,
    title: entry.item.title,
    category: entry.item.category,
    score: entry.score
  }));

  const snippet = scored
    .map((entry) => `[${entry.item.category || 'memory'}] ${entry.item.title}`)
    .join('\n');

  return { snippet, items };
}

const JOSE_EXECUTION_DLQ_KEY = 'alphonso_jose_execution_dlq_v1';
export const JOSE_EXECUTION_DLQ_SCOPE = 'jose_execution_dead_letters_v1';
const MAX_TASK_RETRIES = 3;
const TASK_RETRY_BACKOFF_MS = [1000, 2000, 4000];
const MAX_DLQ_ENTRIES = 250;

let joseExecutionDlq = readJoseExecutionDlq();

function readJoseExecutionDlq() {
  try {
    const raw = localStorage.getItem(JOSE_EXECUTION_DLQ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeJoseExecutionDlqEntry(entry = {}) {
  const timestamp = Number(entry.timestamp || entry.timestampMs || timestampMs());
  return {
    taskId: String(entry.taskId || '').trim(),
    instruction: String(entry.instruction || entry.commandText || entry.assignment?.title || '').trim(),
    error: String(entry.error || 'Unknown task failure'),
    attempts: Number(entry.attempts || 0),
    timestamp,
    commandId: entry.commandId || null,
    packetId: entry.packetId || null,
    agent: entry.agent || null,
    actionType: entry.actionType || null,
    commandText: entry.commandText || null,
    assignment: entry.assignment || null,
    endpoint: entry.endpoint || null
  };
}

function persistJoseExecutionDlq(nextRows) {
  const rows = nextRows.map((entry) => normalizeJoseExecutionDlqEntry(entry)).filter((entry) => entry.taskId);
  joseExecutionDlq = rows.slice(-MAX_DLQ_ENTRIES);
  try {
    invoke('kv_set', { key: JOSE_EXECUTION_DLQ_KEY, value: JSON.stringify(joseExecutionDlq) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(JOSE_EXECUTION_DLQ_KEY, JSON.stringify(joseExecutionDlq));
  } catch {
    // Keep the in-memory DLQ available even if localStorage is unavailable.
  }
  void persistScopeRows(JOSE_EXECUTION_DLQ_SCOPE, joseExecutionDlq, (row) => ({
    id: row.taskId,
    data: row,
    status: 'dead_letter',
    confidence: TRUST_STATES.FAILED,
    verificationState: TRUST_STATES.FAILED,
    timestampMs: Number(row.timestamp || timestampMs())
  }));
}

function upsertJoseExecutionDlqEntry(entry) {
  const normalized = normalizeJoseExecutionDlqEntry(entry);
  if (!normalized.taskId) return null;
  const next = joseExecutionDlq.filter((row) => row.taskId !== normalized.taskId);
  next.push(normalized);
  persistJoseExecutionDlq(next);
  return normalized;
}

function removeJoseExecutionDlqEntry(taskId) {
  const next = joseExecutionDlq.filter((row) => row.taskId !== taskId);
  if (next.length !== joseExecutionDlq.length) {
    persistJoseExecutionDlq(next);
  }
}

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function getExecutionInstruction(commandText, assignment) {
  return String(assignment?.commandPreview || assignment?.title || commandText || '').trim() || 'Jose execution task';
}

function isRetryableTaskFailure(result) {
  return result?.resultState === 'failed' || result?.ok === false;
}

async function executeAssignmentWithRetries(packet, assignment, commandText, options = {}) {
  const taskId = packet?.id || assignment?.packetId || `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const instruction = getExecutionInstruction(commandText, assignment);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_TASK_RETRIES + 1; attempt += 1) {
    try {
      const result = await executeAssignment(packet, assignment, commandText, options);
      if (isRetryableTaskFailure(result)) {
        throw new Error(result.summary || `Task "${instruction}" returned a failed result.`);
      }
      return {
        ok: true,
        attempts: attempt,
        result,
        taskId,
        instruction
      };
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_TASK_RETRIES) {
        await delay(TASK_RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
  }

  const errorMessage = String(lastError?.message || lastError || `Task "${instruction}" failed.`);
  const dlqEntry = upsertJoseExecutionDlqEntry({
    taskId,
    instruction,
    error: errorMessage,
    attempts: MAX_TASK_RETRIES + 1,
    timestamp: timestampMs(),
    commandId: packet?.payload?.joseCommandId || null,
    packetId: packet?.id || assignment?.packetId || null,
    agent: assignment?.agent || null,
    actionType: assignment?.actionType || null,
    commandText,
    assignment,
    endpoint: options.endpoint || null
  });

  return {
    ok: false,
    attempts: MAX_TASK_RETRIES + 1,
    error: errorMessage,
    dlqEntry,
    taskId,
    instruction
  };
}

function buildMiyaFallbackPackage(commandText, assignment) {
  const topic = String(commandText || '').trim();
  const title = topic.slice(0, 120) || 'Untitled creative package';
  const hook = `Hook: ${title}`;
  const sceneA = `Scene 1: Open with the core problem from "${title}".`;
  const sceneB = 'Scene 2: Show transformation steps with clear outcome.';
  const cta = 'Scene 3: Close with one actionable next step and CTA.';
  return {
    title,
    hook,
    script: `${hook}\n\n${sceneA}\n${sceneB}\n${cta}`,
    scenes: [sceneA, sceneB, cta],
    prompts: [
      `Cinematic storyboard frame for: ${title}`,
      `Thumbnail prompt for: ${title}`
    ],
    assignmentAction: assignment?.actionType || 'creative_package'
  };
}

async function executeImageGeneration(prompts, options = {}) {
  const results = [];
  const promptList = Array.isArray(prompts) ? prompts.slice(0, 3) : [];
  if (promptList.length === 0) return results;

  for (const promptText of promptList) {
    try {
      const imageResult = await generateComfyUiImage({
        prompt: promptText,
        negativePrompt: 'blurry, low quality, watermark, text, deformed',
        width: 512,
        height: 512,
        steps: 20,
        cfgScale: 7
      }, { endpoint: options.endpoint || 'http://127.0.0.1:8188' });
      if (imageResult?.ok) {
        results.push({
          prompt: promptText,
          status: 'generated',
          imageUrls: imageResult.imageUrls || [],
          previewBase64: imageResult.previewBase64 || null,
          outputPaths: imageResult.outputPaths || [],
          provider: imageResult.provider || 'comfyui',
          checkpoint: imageResult.checkpoint || null
        });
      } else {
        results.push({
          prompt: promptText,
          status: 'failed',
          error: imageResult?.error || 'Generation failed',
          provider: imageResult?.provider || 'comfyui'
        });
      }
    } catch (error) {
      results.push({
        prompt: promptText,
        status: 'error',
        error: String(error?.message || error || 'Unknown error'),
        provider: 'comfyui'
      });
    }
  }
  return results;
}

async function buildMiyaPackage(commandText, assignment, options = {}) {
  const fallback = buildMiyaFallbackPackage(commandText, assignment);
  if (options.draftDisabled) return fallback;

  try {
    const prompt = draftPrompt('miya', commandText, { snippet: options.retrievedContext?.snippet || '' });
    const response = await generateOllamaResponse({
      endpoint: options.endpoint,
      model: options.model || PREFERRED_MODEL,
      prompt
    });
    const parsed = parseJsonResponse(response?.response);
    if (parsed && typeof parsed.title === 'string') {
      return {
        title: parsed.title.slice(0, 120) || fallback.title,
        hook: String(parsed.hook || fallback.hook),
        script: String(parsed.script || fallback.script),
        scenes: Array.isArray(parsed.scenes) && parsed.scenes.length > 0
          ? parsed.scenes.map(String)
          : fallback.scenes,
        prompts: Array.isArray(parsed.prompts) && parsed.prompts.length > 0
          ? parsed.prompts.map(String)
          : fallback.prompts,
        assignmentAction: assignment?.actionType || 'creative_package'
      };
    }
  } catch { /* fall through to template */ }
  return fallback;
}

async function executeAlphonsoAssignment(commandText, assignment, options = {}) {
  const miyaContext = options.priorOutputs?.miya;
  const lower = String(commandText || '').toLowerCase();
  const artifacts = [];
  const results = [];
  const filesWritten = [];

  // 1. Determine project directory
  const projectDir = options.projectDirectory || getProjectDirectoryPath(assignment?.commandId) || null;

  // 2. Intent detection
  const isBuildIntent = /\b(build|compile|bundle|package)\b/.test(lower);
  const isTestIntent = /\b(test|verify|check|lint)\b/.test(lower);
  const isInstallIntent = /\b(install|setup|add)\b/.test(lower);
  const isRunIntent = /\b(run|start|launch|serve|dev)\b/.test(lower);
  const isCodeGeneration = /\b(create|build|make|generate|scaffold|write|code|app|full stack|project|implement|develop)\b/.test(lower);
  const hasCodeContext = isBuildIntent || isTestIntent || isInstallIntent || isRunIntent;

  // 3. If code generation intent, use LLM to generate files + plan
  if (isCodeGeneration && !hasCodeContext) {
    // 3a. Scaffold project structure first if a stack template matches
    const stackTemplate = detectStackTemplate(commandText);
    if (stackTemplate && projectDir) {
      options.onProgress?.({ stage: 'scaffolding', agent: 'alphonso', detail: `Scaffolding ${stackTemplate.name}` });
      const scaffoldResult = await scaffoldProject(commandText, projectDir);
      if (scaffoldResult && scaffoldResult.filesWritten.length > 0) {
        filesWritten.push(...scaffoldResult.filesWritten);
        results.push(`Scaffolded ${scaffoldResult.templateName}: ${scaffoldResult.filesWritten.length} files`);
        artifacts.push({
          type: 'project_scaffold',
          template: scaffoldResult.templateName,
          files: scaffoldResult.filesWritten
        });

        // Execute scaffold install commands
        for (const cmd of scaffoldResult.commands || []) {
          options.onProgress?.({ stage: 'executing_command', agent: 'alphonso', detail: `Running ${cmd.program} ${cmd.args.join(' ')}` });
          const execProof = await verifyCommandExecution(cmd.program, cmd.args, projectDir);
          const payload = execProof?.payload || {};
          results.push(`Scaffold install: ${cmd.program} ${cmd.args.join(' ')} — exit ${payload.exitCode ?? '?'}`);
        }
      }
    }

    // 3b. Use LLM to generate/enhance code
    options.onProgress?.({ stage: 'generating_code', agent: 'alphonso', detail: 'Generating code plan and files via LLM' });

    try {
      const prompt = draftPrompt('alphonso', commandText, {
        snippet: miyaContext ? `Miya creative input: ${miyaContext.summary}` : ''
      });
      const response = await generateOllamaResponse(prompt, { endpoint: options.endpoint });
      const parsed = parseJsonResponse(response?.response);

      if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0) {
        // Write each generated file
        for (const file of parsed.files) {
          if (file.path && file.content) {
            const safePath = String(file.path).replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
            try {
              await writeWorkspaceArtifact({
                workspaceRoot: projectDir || '',
                relativePath: safePath,
                content: String(file.content)
              });
              filesWritten.push(safePath);
              results.push(`Wrote: ${safePath}`);
            } catch (writeErr) {
              results.push(`Failed to write ${safePath}: ${String(writeErr?.message || writeErr)}`);
            }
          }
        }

        artifacts.push({
          type: 'code_generation',
          filesCount: filesWritten.length,
          files: filesWritten,
          plan: parsed.plan || null,
          summary: parsed.summary || null
        });
      }

      // Execute any commands the LLM specified
      if (Array.isArray(parsed?.commands)) {
        for (const cmd of parsed.commands) {
          if (cmd.program && Array.isArray(cmd.args)) {
            options.onProgress?.({ stage: 'executing_command', agent: 'alphonso', detail: `Running ${cmd.program} ${cmd.args.join(' ')}` });
            const execProof = await verifyCommandExecution(cmd.program, cmd.args, projectDir);
            const payload = execProof?.payload || {};
            results.push(`Command: ${cmd.program} ${cmd.args.join(' ')} — exit ${payload.exitCode ?? '?'}`);
            artifacts.push({
              type: 'command_execution',
              program: cmd.program,
              args: cmd.args,
              exitCode: payload.exitCode ?? null,
              success: payload.success === true,
              stdout: String(payload.stdout || '').slice(0, 2000),
              stderr: String(payload.stderr || '').slice(0, 2000),
              trust: execProof?.trust || 'unverified'
            });
          }
        }
      }
    } catch (llmError) {
      results.push(`LLM generation failed: ${String(llmError?.message || llmError)}. Falling back to command execution.`);
    }
  }

  // 4. Execute direct commands when build/test/install/run intent detected
  if (hasCodeContext) {
    let program = 'npm';
    let args = ['run', 'build'];
    let intentLabel = 'build';

    if (isTestIntent) {
      args = ['run', 'test'];
      intentLabel = 'test';
    } else if (isInstallIntent) {
      const pkgMatch = commandText.match(/install\s+(\S+)/i);
      args = pkgMatch ? ['install', pkgMatch[1]] : ['install'];
      intentLabel = 'install';
    } else if (isRunIntent) {
      if (/dev|serve|start/.test(lower)) {
        args = ['run', 'dev'];
        intentLabel = 'dev server';
      } else {
        args = ['run', 'start'];
        intentLabel = 'start';
      }
    }

    options.onProgress?.({ stage: 'executing_command', agent: 'alphonso', detail: `Running ${intentLabel}: ${program} ${args.join(' ')}` });

    const executionProof = await verifyCommandExecution(program, args, projectDir);
    const payload = executionProof?.payload || {};
    const exitCode = payload.exitCode ?? null;
    const stdout = payload.stdout || '';
    const stderr = payload.stderr || '';
    const success = payload.success === true || exitCode === 0;

    results.push(`Command: ${program} ${args.join(' ')}`);
    results.push(`Exit code: ${exitCode}`);
    if (stdout) results.push(`stdout: ${stdout.slice(0, 500)}`);
    if (stderr) results.push(`stderr: ${stderr.slice(0, 500)}`);

    artifacts.push({
      type: 'command_execution',
      program,
      args,
      exitCode,
      success,
      stdout: stdout.slice(0, 2000),
      stderr: stderr.slice(0, 2000),
      trust: executionProof?.trust || 'unverified'
    });
  }

  // 5. Always verify runtime state
  const runtimeProof = await verifyOllamaRuntimeProof(options.endpoint);
  const processProof = await verifyProcessProof(['ollama']);
  const runtimeReachable = runtimeProof?.payload?.reachable === true;
  const processRunning = Array.isArray(processProof?.payload)
    ? processProof.payload.some((item) => item?.running)
    : false;

  artifacts.push({ type: 'runtime_proof', id: runtimeProof?.id || null });
  artifacts.push({ type: 'process_proof', id: processProof?.id || null });

  if (miyaContext) {
    artifacts.push({ type: 'miya_creative_input', summary: miyaContext.summary });
    results.push(`Miya creative package available: ${miyaContext.summary}`);
  }

  // 6. Determine final state
  const commandResult = artifacts.find((a) => a.type === 'command_execution');
  const codeGenResult = artifacts.find((a) => a.type === 'code_generation');
  let resultState;
  if (commandResult) {
    resultState = commandResult.success ? 'verified' : 'failed';
  } else if (codeGenResult) {
    resultState = filesWritten.length > 0 ? 'verified' : 'failed';
  } else {
    resultState = runtimeReachable ? 'verified' : 'failed';
  }

  const summaryParts = [];
  if (codeGenResult) {
    summaryParts.push(`Alphonso generated ${filesWritten.length} file(s): ${filesWritten.join(', ')}.`);
    if (codeGenResult.plan) summaryParts.push(`Plan: ${codeGenResult.plan}`);
  }
  if (commandResult) {
    summaryParts.push(`Executed ${commandResult.program} ${commandResult.args.join(' ')} (exit ${commandResult.exitCode ?? 'unknown'}). ${commandResult.success ? 'Succeeded.' : 'Failed.'}`);
  }
  summaryParts.push(runtimeReachable ? 'Runtime reachable.' : 'Runtime unreachable.');
  if (results.length > 0) {
    summaryParts.push(results.join(' | '));
  }

  return {
    summary: summaryParts.join(' ') || `Alphonso completed execution for "${commandText}".`,
    resultState,
    resultUrl: null,
    artifacts,
    sources: [],
    contractAction: assignment?.actionType || 'local_operation',
    runtimeReachable,
    processRunning
  };
}

async function executeMiyaAssignment(commandText, assignment, options = {}) {
  if (isContentCatalystRequest(commandText)) {
    options.onProgress?.({ stage: 'content_catalyst', agent: 'miya', detail: 'Running full content pipeline' });
    try {
      const ccRequest = parseContentCatalystRequest(commandText);
      const ccJob = await runContentCatalystJob(ccRequest, { endpoint: options.endpoint });
      const jobStatus = ccJob?.status || 'unknown';
      const hasDraft = Boolean(ccJob?.draft);
      const hasAssets = Boolean(ccJob?.assets?.image);
      const hasPreview = Boolean(ccJob?.preview);
      return {
        summary: `Miya completed full content catalyst pipeline for "${ccRequest.idea.slice(0, 60)}". Status: ${jobStatus}. Draft: ${hasDraft ? 'yes' : 'no'}. Image: ${hasAssets ? 'yes' : 'no'}. Preview: ${hasPreview ? 'yes' : 'no'}.`,
        resultState: jobStatus === 'ready_for_review' ? 'completed' : jobStatus === 'failed' ? 'failed' : 'pending_review',
        resultUrl: ccJob?.preview?.url || null,
        artifacts: [
          { type: 'content_catalyst_job', jobId: ccJob?.id, status: jobStatus },
          ...(ccJob?.draft ? [{ type: 'content_draft', draft: ccJob.draft }] : []),
          ...(ccJob?.assets?.image ? [{ type: 'content_image', asset: ccJob.assets.image }] : []),
          ...(ccJob?.preview ? [{ type: 'content_preview', preview: ccJob.preview }] : [])
        ],
        sources: [],
        contractAction: assignment?.actionType || 'creative_package'
      };
    } catch (error) {
      return {
        summary: `Content catalyst pipeline failed: ${String(error?.message || error)}`,
        resultState: 'failed',
        resultUrl: null,
        artifacts: [{ type: 'content_catalyst_error', error: String(error?.message || error) }],
        sources: [],
        contractAction: assignment?.actionType || 'creative_package'
      };
    }
  }
  const hectorContext = options.priorOutputs?.hector;
  let enrichedOptions = options;
  if (hectorContext) {
    const researchSnippet = [
      hectorContext.summary,
      hectorContext.sources?.length ? `Sources: ${hectorContext.sources.join(', ')}` : '',
      hectorContext.artifacts?.length ? `Research artifacts: ${hectorContext.artifacts.map((a) => a.type || a.reportId || 'report').join(', ')}` : ''
    ].filter(Boolean).join('\n');
    enrichedOptions = { ...options, retrievedContext: { snippet: researchSnippet, items: [] } };
  }
  const creativePackage = await buildMiyaPackage(commandText, assignment, enrichedOptions);
  const shouldGenerateImages = creativePackage.prompts?.length > 0
    && !options.draftDisabled
    && String(commandText || '').toLowerCase().match(/image|photo|picture|visual|generate|create.*(?:art|illustration|render|graphic)/);
  let generatedImages = [];
  if (shouldGenerateImages) {
    options.onProgress?.({ stage: 'generating_images', agent: 'miya', promptCount: creativePackage.prompts.length });
    generatedImages = await executeImageGeneration(creativePackage.prompts, { endpoint: options.endpoint });
  }
  pushMiyaMemory({
    category: 'creative_memory',
    title: `Miya package: ${creativePackage.title}`,
    content: creativePackage,
    source: 'jose-execution-engine',
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  pushMemoryItem({
    title: `Miya delivered creative package`,
    category: 'creative_memory',
    content: {
      title: creativePackage.title,
      scenes: creativePackage.scenes.length,
      prompts: creativePackage.prompts.length
    },
    source: 'jose-execution-engine',
    sourceAgent: AGENTS.MIYA,
    confidence: TRUST_STATES.INFERRED,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  const generatedCount = generatedImages.filter((g) => g.status === 'generated').length;
  const summaryParts = [`Miya generated a structured creative package for "${creativePackage.title}".`];
  if (generatedCount > 0) summaryParts.push(`${generatedCount} image(s) generated via ComfyUI.`);
  const failedCount = generatedImages.filter((g) => g.status !== 'generated').length;
  if (failedCount > 0) summaryParts.push(`${failedCount} image generation(s) failed.`);
  return {
    summary: summaryParts.join(' '),
    resultState: 'completed',
    resultUrl: null,
    artifacts: [
      creativePackage,
      {
        type: 'comfyui_local_generation_options',
        connectorId: 'comfyui_video',
        endpoint: 'http://127.0.0.1:8188',
        presets: listMiyaComfyWorkflowPresets().map((preset) => ({
          id: preset.id,
          name: preset.name,
          mediaType: preset.mediaType,
          status: preset.status,
          description: preset.description
        })),
        templates: listMiyaWorkflowTemplates().map((tpl) => ({
          name: tpl.name,
          description: tpl.description,
          required_inputs: tpl.required_inputs
        }))
      },
      ...(generatedImages.length > 0 ? [{
        type: 'generated_images',
        images: generatedImages,
        count: generatedImages.filter((g) => g.status === 'generated').length
      }] : [])
    ],
    sources: [],
    contractAction: assignment?.actionType || 'creative_package'
  };
}

async function executeHectorAssignment(commandText, assignment, options = {}) {
  const action = String(assignment?.actionType || '').toLowerCase();
  if (action.includes('external_publish_handoff')) {
    return {
      summary: 'Hector prepared publish-readiness handoff. External publish remains approval-gated.',
      resultState: 'pending_review',
      resultUrl: null,
      artifacts: [{ type: 'publish_handoff', status: 'approval_required' }],
      sources: [],
      contractAction: assignment?.actionType || 'external_publish_handoff'
    };
  }

  const draft = createResearchDraft({
    researchQuestion: commandText,
    sourceUrls: [],
    sourceType: 'official_docs',
    riskLevel: assignment?.riskLevel || 'medium'
  });
  const report = await runHectorLiveResearch(draft.id);
  const sourceRefs = Array.isArray(report?.sources) ? report.sources.map((item) => item?.url).filter(Boolean) : [];

  let summary = report?.summary || 'Hector research run completed.';
  if (!options.draftDisabled) {
    try {
      const contextSnippet = [summary, options.retrievedContext?.snippet].filter(Boolean).join('\n');
      const prompt = draftPrompt('hector', commandText, { snippet: contextSnippet });
      const response = await generateOllamaResponse({
        endpoint: options.endpoint,
        model: options.model || PREFERRED_MODEL,
        prompt
      });
      const llmSummary = String(response?.response || '').trim();
      if (llmSummary.length > 20) {
        summary = llmSummary;
      }
    } catch { /* fall through to existing summary */ }
  }

  return {
    summary,
    resultState: report?.confidenceLevel === TRUST_STATES.VERIFIED ? 'verified' : 'pending_review',
    resultUrl: null,
    artifacts: [{ type: 'hector_report', reportId: report?.id || draft.id }],
    sources: sourceRefs.length ? sourceRefs : [`hector_report:${report?.id || draft.id}`],
    contractAction: assignment?.actionType || 'research'
  };
}

async function executeJoseAssignment(commandText, assignment) {
  return {
    summary: `Jose completed orchestration review for "${commandText}".`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'orchestration_review', action: assignment?.actionType || 'orchestration_review' }],
    sources: [],
    contractAction: assignment?.actionType || 'orchestration_review'
  };
}

async function executeMariaAssignment(commandText, assignment, options = {}) {
  const priorOutputs = options.priorOutputs || {};
  const risks = [];
  const issues = [];
  const approvals = [];

  const riskLevel = String(assignment?.riskLevel || 'low').toLowerCase();
  if (riskLevel === 'high' || riskLevel === 'critical') {
    risks.push({ level: riskLevel, reason: `Assignment risk level is ${riskLevel}.` });
  }

  const actionType = String(assignment?.actionType || '').toLowerCase();
  if (actionType.includes('delete') || actionType.includes('remove') || actionType.includes('destroy')) {
    risks.push({ level: 'high', reason: 'Destructive action detected in action type.' });
    approvals.push({ required: true, reason: 'Destructive action requires operator approval.' });
  }
  if (actionType.includes('publish') || actionType.includes('deploy') || actionType.includes('send') || actionType.includes('post')) {
    risks.push({ level: 'medium', reason: 'Public/external action detected.' });
    approvals.push({ required: true, reason: 'External action requires operator approval.' });
  }
  if (actionType.includes('file_write') || actionType.includes('filesystem')) {
    risks.push({ level: 'medium', reason: 'Filesystem modification detected.' });
    approvals.push({ required: true, reason: 'File system changes require approval.' });
  }

  for (const [agent, output] of Object.entries(priorOutputs)) {
    const agentTrust = String(output?.trust || output?.verificationState || '').toLowerCase();
    if (agentTrust === 'failed' || agentTrust === 'unverified') {
      issues.push({ agent, issue: `${agent} output has trust state: ${agentTrust}.` });
    }
    if (output?.resultState === 'failed') {
      issues.push({ agent, issue: `${agent} execution failed.` });
    }
    if (output?.blocked) {
      issues.push({ agent, issue: `${agent} output was blocked.` });
    }
  }

  const overallRisk = risks.some((r) => r.level === 'critical') ? 'critical'
    : risks.some((r) => r.level === 'high') ? 'high'
    : risks.some((r) => r.level === 'medium') ? 'medium'
    : 'low';

  const approved = issues.length === 0 && !approvals.some((a) => a.required);

  const summary = [
    `Maria governance audit for "${(commandText || '').slice(0, 80)}".`,
    `Overall risk: ${overallRisk}.`,
    `Risks identified: ${risks.length}.`,
    `Issues: ${issues.length}.`,
    `Approvals required: ${approvals.length}.`,
    approved ? 'Audit passed. Safe to proceed.' : 'Audit flagged. Review required before execution.'
  ].join(' ');

  return {
    summary,
    resultState: approved ? 'completed' : 'pending_review',
    resultUrl: null,
    artifacts: [
      { type: 'governance_audit', action: assignment?.actionType || 'governance_audit' },
      { type: 'risk_assessment', risks, overallRisk },
      { type: 'compliance_issues', issues },
      { type: 'approval_requirements', approvals }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'governance_audit',
    trust: approved ? TRUST_STATES.VERIFIED : TRUST_STATES.PENDING,
    verificationState: approved ? TRUST_STATES.VERIFIED : TRUST_STATES.PENDING
  };
}

async function executeEchoAssignment(commandText, assignment, options = {}) {
  const priorOutputs = options.priorOutputs || {};
  const preservedSummaries = Object.entries(priorOutputs)
    .map(([agent, output]) => `[${agent}] ${output?.summary || 'no summary'}`)
    .join('\n');
  pushMemoryItem({
    title: `Echo preserved workflow decision`,
    category: 'timeline_memory',
    content: {
      commandText,
      assignmentAction: assignment?.actionType || 'memory_preservation',
      agentSummaries: preservedSummaries || 'no prior agent outputs',
      agentCount: Object.keys(priorOutputs).length
    },
    source: 'jose-execution-engine',
    sourceAgent: 'echo',
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  return {
    summary: `Echo preserved command context and workflow output for "${commandText}". Prior agents: ${Object.keys(priorOutputs).join(', ') || 'none'}.`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [{ type: 'memory_preservation', status: 'recorded', preservedAgents: Object.keys(priorOutputs) }],
    sources: [],
    contractAction: assignment?.actionType || 'memory_preservation'
  };
}

async function executeSentinelAssignment(commandText, assignment, options = {}) {
  const priorOutputs = options.priorOutputs || {};
  const allTextToScan = [commandText, ...Object.values(priorOutputs).map((o) => o?.summary || '')].filter(Boolean).join('\n');

  // 1. Classify risk using missionRoomService regex patterns
  const riskClassification = classifyMissionRoomRisk(allTextToScan);

  // 2. Compute weighted risk score (0-100)
  let riskScore = 0;
  const findings = [];

  // Secret detection = high weight
  if (riskClassification.secretDetected) {
    riskScore += 40;
    findings.push({ severity: 'critical', type: 'secret_detected', detail: 'Potential API key, token, or secret found in command or prior agent outputs.' });
  }

  // Count high-risk pattern matches
  const highRiskCount = riskClassification.flags.filter((f) => f.startsWith('high_risk_')).length;
  riskScore += highRiskCount * 12;
  if (highRiskCount > 0) {
    findings.push({ severity: 'high', type: 'high_risk_patterns', detail: `${highRiskCount} high-risk keyword pattern(s) matched (publish, delete, deploy, etc.).` });
  }

  // Count medium-risk pattern matches
  const mediumRiskCount = riskClassification.flags.filter((f) => f.startsWith('medium_risk_')).length;
  riskScore += mediumRiskCount * 5;
  if (mediumRiskCount > 0) {
    findings.push({ severity: 'medium', type: 'medium_risk_patterns', detail: `${mediumRiskCount} medium-risk keyword pattern(s) matched (install, edit, write, etc.).` });
  }

  // Prior agent trust analysis
  const failedPriorAgents = Object.entries(priorOutputs)
    .filter(([, output]) => output?.resultState === 'failed' || output?.resultState === 'rejected')
    .map(([agent]) => agent);
  if (failedPriorAgents.length > 0) {
    riskScore += failedPriorAgents.length * 8;
    findings.push({ severity: 'medium', type: 'prior_failure', detail: `Prior agent(s) failed or were rejected: ${failedPriorAgents.join(', ')}.` });
  }

  // Clamp score
  riskScore = Math.min(100, Math.max(0, riskScore));

  // 3. Determine severity classification
  let severity;
  if (riskScore >= 70) severity = 'critical';
  else if (riskScore >= 45) severity = 'high';
  else if (riskScore >= 20) severity = 'medium';
  else severity = 'low';

  // 4. Determine if execution should be blocked
  const shouldBlock = riskScore >= 70 || riskClassification.secretDetected;
  const resultState = shouldBlock ? 'pending_review' : 'completed';

  // 5. Log security event
  try {
    const { appendMissionSecurityEvent } = await import('./missionRoomService');
    appendMissionSecurityEvent({
      type: 'sentinel_scan',
      actor: 'sentinel',
      riskLevel: severity,
      summary: `Sentinel scanned command: ${redactMissionRoomSecrets(commandText).slice(0, 200)} | Risk: ${riskScore}/100 | Blocked: ${shouldBlock}`,
      metadata: { riskScore, findings: findings.length, blocked: shouldBlock }
    });
  } catch { /* security event logging is best-effort */ }

  return {
    summary: `Sentinel security scan: risk ${riskScore}/100 (${severity}). ${findings.length} finding(s). ${shouldBlock ? 'BLOCKED — requires approval.' : 'Cleared for execution.'}`,
    resultState,
    resultUrl: null,
    artifacts: [
      {
        type: 'security_assessment',
        riskScore,
        severity,
        blocked: shouldBlock,
        findings,
        flags: riskClassification.flags,
        secretDetected: riskClassification.secretDetected,
        approvalRequired: riskClassification.approvalRequired
      }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'security_monitor'
  };
}

async function executeNovaAssignment(commandText, assignment, options = {}) {
  const priorOutputs = options.priorOutputs || {};
  const lower = String(commandText || '').toLowerCase();

  // 1. Compute Opportunity Score (0-100) based on signal analysis
  let opportunityScore = 0;
  const opportunitySignals = [];

  // Scope/impact signals — broader scope = higher opportunity
  if (/\b(build|create|launch|ship|deploy)\b/.test(lower)) {
    opportunityScore += 15;
    opportunitySignals.push('execution_intent');
  }
  if (/\b(design|creative|content|visual|story|script)\b/.test(lower)) {
    opportunityScore += 12;
    opportunitySignals.push('creative_potential');
  }
  if (/\b(research|analyze|study|investigate)\b/.test(lower)) {
    opportunityScore += 10;
    opportunitySignals.push('research_potential');
  }
  if (/\b(saas|app|dashboard|platform|product)\b/.test(lower)) {
    opportunityScore += 14;
    opportunitySignals.push('product_scope');
  }
  if (/\b(market|audience|user|customer|growth)\b/.test(lower)) {
    opportunityScore += 10;
    opportunitySignals.push('market_relevance');
  }
  if (/\b(automation|workflow|pipeline|system)\b/.test(lower)) {
    opportunityScore += 8;
    opportunitySignals.push('automation_value');
  }
  if (/\b(revenue|monetize|pricing|subscription)\b/.test(lower)) {
    opportunityScore += 10;
    opportunitySignals.push('revenue_potential');
  }

  // Prior agent context bonus — if Miya or Hector already provided input, opportunity increases
  if (priorOutputs?.miya?.resultState === 'completed') {
    opportunityScore += 8;
    opportunitySignals.push('miya_creative_ready');
  }
  if (priorOutputs?.hector?.resultState === 'completed') {
    opportunityScore += 8;
    opportunitySignals.push('hector_research_ready');
  }

  opportunityScore = Math.min(100, Math.max(0, opportunityScore));

  // 2. Compute Risk Score (0-100) based on risk signals
  let riskScore = 0;
  const riskSignals = [];

  if (/\b(delete|remove|drop|destroy|rm)\b/.test(lower)) {
    riskScore += 20;
    riskSignals.push('destructive_action');
  }
  if (/\b(publish|post|deploy|push|send|email|dm)\b/.test(lower)) {
    riskScore += 15;
    riskSignals.push('external_action');
  }
  if (/\b(pay|buy|purchase|subscribe|stripe|payment)\b/.test(lower)) {
    riskScore += 18;
    riskSignals.push('financial_action');
  }
  if (/\b(secret|token|password|api.?key|credential|auth)\b/.test(lower)) {
    riskScore += 22;
    riskSignals.push('credential_exposure');
  }
  if (/\b(production|live|real|actual)\b/.test(lower)) {
    riskScore += 12;
    riskSignals.push('production_risk');
  }
  if (/\b(database|sql|migration|schema)\b/.test(lower)) {
    riskScore += 10;
    riskSignals.push('data_risk');
  }
  if (/\b(install|npm|pip|cargo)\b/.test(lower)) {
    riskScore += 5;
    riskSignals.push('dependency_risk');
  }

  // Failed prior agents increase risk
  const failedPriorCount = Object.values(priorOutputs).filter((o) => o?.resultState === 'failed').length;
  if (failedPriorCount > 0) {
    riskScore += failedPriorCount * 8;
    riskSignals.push('prior_failures');
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  // 3. Compute combined score
  const combinedScore = Math.round((opportunityScore * 0.6) + ((100 - riskScore) * 0.4));

  // 4. Store score for decomposition hints
  const scoreEntry = storeNovaScore(assignment?.commandId || `nova_${Date.now()}`, {
    opportunityScore,
    riskScore,
    score: combinedScore
  });

  // 5. Generate decomposition hints
  const { hints } = getDecompositionHints(scoreEntry?.commandId);

  // 6. Determine priority tier
  let priorityTier;
  if (combinedScore >= 75) priorityTier = 'critical';
  else if (combinedScore >= 55) priorityTier = 'high';
  else if (combinedScore >= 35) priorityTier = 'medium';
  else priorityTier = 'low';

  return {
    summary: `Nova scored opportunity ${opportunityScore}/100, risk ${riskScore}/100, combined ${combinedScore}/100 (${priorityTier} priority). ${hints.length} decomposition hint(s).`,
    resultState: 'completed',
    resultUrl: null,
    artifacts: [
      {
        type: 'opportunity_score',
        opportunityScore,
        riskScore,
        combinedScore,
        priorityTier,
        opportunitySignals,
        riskSignals,
        hints: hints.map((h) => h.message),
        scoreId: scoreEntry?.commandId || null
      }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'opportunity_analysis'
  };
}

async function executeMarcusAssignment(commandText, assignment, options = {}) {
  const mariaContext = options.priorOutputs?.maria;
  const governanceStatus = mariaContext?.resultState || 'unknown';
  const governanceArtifacts = mariaContext?.artifacts || [];
  const governanceSummary = mariaContext?.summary || '';
  return {
    summary: mariaContext
      ? `Marcus reviewed governance approval (status: ${governanceStatus}) and prepared distribution execution for "${commandText}". Governance: ${governanceSummary}`
      : `Marcus requires explicit approved external execution before distribution for "${commandText}".`,
    resultState: governanceStatus === 'completed' ? 'pending_review' : 'pending_review',
    resultUrl: null,
    artifacts: [
      { type: 'distribution_execution', status: 'approval_required' },
      ...(mariaContext ? [{
        type: 'governance_review_input',
        agent: 'maria',
        resultState: governanceStatus,
        governanceSummary,
        governanceArtifacts
      }] : [])
    ],
    sources: [],
    contractAction: assignment?.actionType || 'distribution_execution'
  };
}

async function executeBoardroomPlanning(assignment, commandText, options = {}) {
  const goalText = String(commandText || '')
    .replace(/^(\/jose\s+|ask\s+jose\s+|jose:\s*)/i, '')
    .replace(/\b(plan|roadmap|batch|boardroom|decompose|break down|milestones|sprint|backlog)\b/gi, '')
    .trim();

  const activeGoal = getActiveGoal();

  if (!activeGoal && !goalText) {
    return {
      summary: 'No active project goal and no goal text provided. Please specify a goal: "plan Build a SaaS dashboard".',
      resultState: 'completed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_planning'
    };
  }

  if (!activeGoal && goalText) {
    const goal = createProjectGoal(goalText);
    const batch = await generateBatch(goal.id, options.endpoint);
    return {
      summary: `Project goal created: "${goal.goal}". Batch #${batch.batchNumber} generated with ${batch.tasks.length} tasks (${batch.generationMode}). Tasks are ready for execution.`,
      resultState: 'completed',
      artifacts: [{ type: 'batch', batchId: batch.id, batchNumber: batch.batchNumber, taskCount: batch.tasks.length, mode: batch.generationMode }],
      sources: [],
      contractAction: 'boardroom_planning'
    };
  }

  if (activeGoal) {
    const activeBatch = getActiveBatch(activeGoal.id);
    if (activeBatch) {
      const progress = getBatchProgress(activeGoal.id, activeBatch.batchNumber);
      return {
        summary: `Active project: "${activeGoal.goal}". Batch #${activeBatch.batchNumber} is in progress: ${progress.completed}/${progress.total} tasks completed (${progress.percent}%). Complete all tasks before generating the next batch.`,
        resultState: 'completed',
        artifacts: [{ type: 'batch_progress', goalId: activeGoal.id, batchNumber: activeBatch.batchNumber, ...progress }],
        sources: [],
        contractAction: 'boardroom_planning'
      };
    }

    try {
      const nextBatch = await advanceToNextBatch(activeGoal.id, options.endpoint);
      return {
        summary: `Batch #${nextBatch.batchNumber} generated for "${activeGoal.goal}" with ${nextBatch.tasks.length} tasks (${nextBatch.generationMode}). Tasks are ready for execution.`,
        resultState: 'completed',
        artifacts: [{ type: 'batch', batchId: nextBatch.id, batchNumber: nextBatch.batchNumber, taskCount: nextBatch.tasks.length, mode: nextBatch.generationMode }],
        sources: [],
        contractAction: 'boardroom_planning'
      };
    } catch (err) {
      return {
        summary: `Could not generate next batch: ${err.message}`,
        resultState: 'failed',
        artifacts: [],
        sources: [],
        contractAction: 'boardroom_planning'
      };
    }
  }

  return {
    summary: 'Boardroom planning: no action taken.',
    resultState: 'completed',
    artifacts: [],
    sources: [],
    contractAction: 'boardroom_planning'
  };
}

async function executeBoardroomBatch(assignment, commandText, options = {}) {
  const activeGoal = getActiveGoal();
  if (!activeGoal) {
    return {
      summary: 'No active project goal. Use "plan <goal>" to create one first.',
      resultState: 'completed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_execute'
    };
  }

  const activeBatch = getActiveBatch(activeGoal.id);
  if (!activeBatch) {
    return {
      summary: `No active batch for "${activeGoal.goal}". Use "plan" to generate the next batch.`,
      resultState: 'completed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_execute'
    };
  }

  if (activeBatch.status === 'completed') {
    return {
      summary: `Batch #${activeBatch.batchNumber} is already completed. Use "next batch" to advance.`,
      resultState: 'completed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_execute'
    };
  }

  try {
    const result = await executeBatch(activeBatch.id, {
      endpoint: options.endpoint,
      zeroCostMode: options.zeroCostMode,
      onProgress: options.onProgress
    });

    return {
      summary: `Batch #${activeBatch.batchNumber} execution complete. ${result.executedCount} executed, ${result.failedCount} failed.`,
      resultState: result.ok ? 'completed' : 'failed',
      artifacts: [
        { type: 'batch_execution', batchId: activeBatch.id, ...result }
      ],
      sources: [],
      contractAction: 'boardroom_execute'
    };
  } catch (error) {
    return {
      summary: `Batch execution failed: ${String(error?.message || error)}`,
      resultState: 'failed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_execute'
    };
  }
}

async function executeBoardroomAdvance(assignment, commandText, options = {}) {
  const activeGoal = getActiveGoal();
  if (!activeGoal) {
    return {
      summary: 'No active project goal. Use "plan <goal>" to create one first.',
      resultState: 'completed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_advance'
    };
  }

  const activeBatch = getActiveBatch(activeGoal.id);
  if (activeBatch) {
    const progress = getBatchProgress(activeGoal.id, activeBatch.batchNumber);
    return {
      summary: `Batch #${activeBatch.batchNumber} still has ${progress.pending + progress.inProgress} pending/in-progress tasks (${progress.percent}% complete). Complete all tasks before advancing.`,
      resultState: 'completed',
      artifacts: [{ type: 'batch_progress', batchNumber: activeBatch.batchNumber, ...progress }],
      sources: [],
      contractAction: 'boardroom_advance'
    };
  }

  try {
    const nextBatch = await advanceToNextBatch(activeGoal.id, options.endpoint);
    return {
      summary: `Batch #${nextBatch.batchNumber} generated for "${activeGoal.goal}" with ${nextBatch.tasks.length} tasks (${nextBatch.generationMode}). Use "execute batch" to run them.`,
      resultState: 'completed',
      artifacts: [{ type: 'batch', batchId: nextBatch.id, batchNumber: nextBatch.batchNumber, taskCount: nextBatch.tasks.length, mode: nextBatch.generationMode }],
      sources: [],
      contractAction: 'boardroom_advance'
    };
  } catch (error) {
    return {
      summary: `Could not advance batch: ${String(error?.message || error)}`,
      resultState: 'failed',
      artifacts: [],
      sources: [],
      contractAction: 'boardroom_advance'
    };
  }
}

async function executeAssignment(packet, assignment, commandText, options = {}) {
  appendAgentActivity({ agent: assignment?.agent || 'jose', action: 'execute', detail: (commandText || '').slice(0, 80) });
  if (assignment?.actionType === 'boardroom_planning') {
    return executeBoardroomPlanning(assignment, commandText, options);
  }
  if (assignment?.actionType === 'boardroom_execute') {
    return executeBoardroomBatch(assignment, commandText, options);
  }
  if (assignment?.actionType === 'boardroom_advance') {
    return executeBoardroomAdvance(assignment, commandText, options);
  }
  if (assignment?.agent === AGENTS.ALPHONSO) {
    return executeAlphonsoAssignment(commandText, assignment, options);
  }
  if (assignment?.agent === AGENTS.MIYA) {
    return executeMiyaAssignment(commandText, assignment, options);
  }
  if (assignment?.agent === AGENTS.HECTOR) {
    return executeHectorAssignment(commandText, assignment, options);
  }
  if (assignment?.agent === AGENTS.MARIA) {
    return executeMariaAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.ECHO) {
    return executeEchoAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.SENTINEL) {
    return executeSentinelAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.NOVA) {
    return executeNovaAssignment(commandText, assignment);
  }
  if (assignment?.agent === AGENTS.MARCUS) {
    return executeMarcusAssignment(commandText, assignment);
  }
  return executeJoseAssignment(commandText, assignment);
}

async function checkOllamaAvailable(endpoint) {
  try {
    const { models } = await fetchOllamaModels(endpoint);
    return Array.isArray(models) && models.length > 0;
  } catch {
    return false;
  }
}

export async function runJoseCommandExecutionPipeline({
  commandText,
  source = 'shayan',
  endpoint,
  zeroCostMode,
  onProgress
}) {
  const memoryItems = listMemoryItems();
  const retrievedContext = retrieveRelevantContext(commandText, memoryItems);

  const command = await createJoseCommandRoute({ commandText, source, zeroCostMode });
  if (!command) {
    return {
      ok: false,
      reason: 'Command could not be parsed.',
      command: null
    };
  }

  command.retrievedContext = retrievedContext;

  let executedCount = 0;
  let pendingApprovalCount = 0;
  let failedCount = 0;
  const executionReceipts = [];
  const draftDisabled = !(await checkOllamaAvailable(endpoint));

  const novaHints = getDecompositionHints(command.id);

  const { waves, assignmentMap } = buildExecutionPlan(command.assignments || []);

  for (const [waveIndex, wave] of waves.entries()) {
    const waveAssignments = wave.map((agent) => assignmentMap[agent]).filter(Boolean);
    onProgress?.({ stage: 'wave_start', wave: waveIndex, agents: wave, commandId: command.id });
    for (const assignment of waveAssignments) {
      const packet = getPacketById(assignment.packetId);
      if (!packet) {
        failedCount += 1;
        continue;
      }

      if (isBlockedByZeroCostMode(packet, assignment)) {
        pendingApprovalCount += 1;
        updatePacketStatus(assignment.packetId, 'pending_approval', {
          policyBlocked: true,
          policyReason: 'Zero-Cost Mode blocks paid/metered connector route until explicit approval override.',
          verificationState: TRUST_STATES.PENDING
        });
        executionReceipts.push({
          packetId: assignment.packetId,
          agent: assignment.agent,
          status: 'approval_required',
          reason: 'zero_cost_policy_gate'
        });
        onProgress?.({
          stage: 'approval_required',
          assignment,
          packetId: assignment.packetId,
          reason: 'zero_cost_policy_gate'
        });
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: assignment.packetId,
          agent: AGENTS.JOSE,
          fromStatus: packet.status || 'unknown',
          toStatus: 'pending_approval',
          reason: 'Zero-Cost policy gate blocked route.',
          retryCount: packet.retryCount || 0,
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_execution_pipeline',
          commandId: command.id,
          packetId: assignment.packetId,
          eventType: 'policy_gate_blocked',
          status: 'pending_approval',
          agent: AGENTS.JOSE,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'high',
          approved: false,
          blocked: true,
          setupRequired: false,
          details: { reason: 'zero_cost_policy_gate' },
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        continue;
      }

      if (isRiskyAssignment(assignment)) {
        pendingApprovalCount += 1;
        executionReceipts.push({
          packetId: assignment.packetId,
          agent: assignment.agent,
          status: 'approval_required'
        });
        onProgress?.({
          stage: 'approval_required',
          assignment,
          packetId: assignment.packetId
        });
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: assignment.packetId,
          agent: AGENTS.JOSE,
          fromStatus: packet.status || 'unknown',
          toStatus: 'pending_approval',
          reason: 'Risky assignment requires approval.',
          retryCount: packet.retryCount || 0,
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_execution_pipeline',
          commandId: command.id,
          packetId: assignment.packetId,
          eventType: 'approval_required',
          status: 'pending_approval',
          agent: AGENTS.JOSE,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'high',
          approved: false,
          blocked: true,
          setupRequired: false,
          details: { reason: 'risky_assignment' },
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        continue;
      }

      const sentinelGate = checkSentinelGate(command.id, assignment);
      if (sentinelGate.blocked) {
        pendingApprovalCount += 1;
        executionReceipts.push({
          packetId: assignment.packetId,
          agent: assignment.agent,
          status: 'sentinel_blocked',
          reason: sentinelGate.reason
        });
        onProgress?.({
          stage: 'sentinel_blocked',
          assignment,
          packetId: assignment.packetId,
          reason: sentinelGate.reason
        });
        updatePacketStatus(assignment.packetId, 'pending_approval', {
          sentinelBlocked: true,
          sentinelReason: sentinelGate.reason,
          verificationState: TRUST_STATES.PENDING
        });
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: assignment.packetId,
          agent: AGENTS.JOSE,
          fromStatus: packet.status || 'unknown',
          toStatus: 'pending_approval',
          reason: sentinelGate.reason,
          retryCount: packet.retryCount || 0,
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_execution_pipeline',
          commandId: command.id,
          packetId: assignment.packetId,
          eventType: 'sentinel_gate_blocked',
          status: 'pending_approval',
          agent: AGENTS.JOSE,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'high',
          approved: false,
          blocked: true,
          setupRequired: false,
          details: { reason: sentinelGate.reason },
          confidence: TRUST_STATES.VERIFIED,
          verificationState: TRUST_STATES.PENDING
        });
        continue;
      }

      const beforeQueueStatus = packet.status || 'unknown';
      approvePacket(assignment.packetId, 'jose-auto-safe');
      updatePacketStatus(assignment.packetId, 'queued', {
        routedBy: AGENTS.JOSE,
        routedAtMs: timestampMs(),
        verificationState: TRUST_STATES.PENDING
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: AGENTS.JOSE,
        fromStatus: beforeQueueStatus,
        toStatus: 'queued',
        reason: 'Jose approved and queued safe assignment.',
        retryCount: packet.retryCount || 0,
        confidence: TRUST_STATES.TEMPORARY,
        verificationState: TRUST_STATES.PENDING
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'assignment_queued',
        status: 'queued',
        agent: AGENTS.JOSE,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'low',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: { queueReason: 'safe_auto_execution' },
        confidence: TRUST_STATES.TEMPORARY,
        verificationState: TRUST_STATES.PENDING
      });
      const gate = attemptPacketExecution(assignment.packetId, {
        mode: 'jose_execution_engine',
        actionType: assignment.actionType
      });

      if (!gate.ok) {
        failedCount += 1;
        executionReceipts.push({
          packetId: assignment.packetId,
          agent: assignment.agent,
          status: 'failed',
          reason: gate.reason
        });
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: assignment.packetId,
          agent: AGENTS.JOSE,
          fromStatus: 'queued',
          toStatus: 'failed',
          reason: gate.reason || 'Execution gate failed.',
          retryCount: packet.retryCount || 0,
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_execution_pipeline',
          commandId: command.id,
          packetId: assignment.packetId,
          eventType: 'execution_gate_failed',
          status: 'failed',
          agent: AGENTS.JOSE,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'medium',
          approved: true,
          blocked: true,
          setupRequired: false,
          details: { reason: gate.reason || 'unknown' },
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        continue;
      }

      const priorOutputs = getPriorOutputs(command.id, assignment.agent);
      const taskResult = await executeAssignmentWithRetries(packet, assignment, commandText, { endpoint, draftDisabled, retrievedContext, priorOutputs, onProgress });

      if (!taskResult.ok) {
        failedCount += 1;
        updatePacketStatus(assignment.packetId, 'dead_letter', {
          failureReason: taskResult.error,
          deadLetterReason: taskResult.error,
          deadLetterAtMs: timestampMs(),
          retryCount: taskResult.attempts,
          verificationState: TRUST_STATES.FAILED,
          confidence: TRUST_STATES.FAILED
        });
        executionReceipts.push({
          packetId: assignment.packetId,
          agent: assignment.agent,
          status: 'dead_letter',
          reason: taskResult.error,
          attempts: taskResult.attempts
        });
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: assignment.packetId,
          agent: assignment.agent,
          fromStatus: 'queued',
          toStatus: 'dead_letter',
          reason: taskResult.error,
          retryCount: taskResult.attempts,
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_execution_pipeline',
          commandId: command.id,
          packetId: assignment.packetId,
          eventType: 'assignment_dead_lettered',
          status: 'dead_letter',
          agent: assignment.agent,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'medium',
          approved: true,
          blocked: true,
          setupRequired: false,
          details: { error: taskResult.error, attempts: taskResult.attempts },
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        continue;
      }

      const result = taskResult.result;
      setAgentOutput(command.id, assignment.agent, {
        summary: result.summary,
        resultState: result.resultState || 'pending_review',
        artifacts: result.artifacts || [],
        sources: result.sources || [],
        contractAction: result.contractAction || assignment.actionType
      });
      if (assignment.agent === AGENTS.NOVA) {
        const novaScore = extractNovaScore(result);
        if (novaScore) {
          storeNovaScore(command.id, novaScore);
        }
      }
      createAgentReportToJose({
        packetId: assignment.packetId,
        reportingAgent: assignment.agent,
        summary: result.summary,
        resultState: result.resultState || 'pending_review',
        resultUrl: result.resultUrl || null,
        artifacts: result.artifacts || [],
        sources: result.sources || []
      });
      executedCount += 1;
      executionReceipts.push({
        packetId: assignment.packetId,
        agent: assignment.agent,
        status: 'executed',
        resultState: result.resultState || 'pending_review',
        attempts: taskResult.attempts
      });
      onProgress?.({
        stage: 'executed',
        assignment,
        packetId: assignment.packetId,
        result
      });
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: assignment.packetId,
        agent: assignment.agent,
        fromStatus: 'queued',
        toStatus: 'reported_to_jose',
        reason: 'Assignment executed and reported back to Jose.',
        retryCount: packet.retryCount || 0,
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.VERIFIED
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_execution_pipeline',
        commandId: command.id,
        packetId: assignment.packetId,
        eventType: 'assignment_executed_reported',
        status: 'reported_to_jose',
        agent: assignment.agent,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'low',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: { resultState: result.resultState || 'pending_review', attempts: taskResult.attempts },
        confidence: TRUST_STATES.VERIFIED,
        verificationState: TRUST_STATES.VERIFIED
      });
    }
  }

  const confirmationText = pendingApprovalCount > 0
    ? `Jose executed ${executedCount} task(s); ${pendingApprovalCount} task(s) are waiting for approval.`
    : `Jose executed ${executedCount} task(s) and merged agent reports.`;
  const updatedCommand = confirmJoseCommand(command.id, confirmationText);

  appendSessionEvent({
    category: 'orchestration',
    title: 'Jose execution pipeline completed',
    details: {
      commandId: command.id,
      executedCount,
      pendingApprovalCount,
      failedCount
    },
    agent: AGENTS.JOSE,
    confidence: failedCount > 0 ? TRUST_STATES.INFERRED : TRUST_STATES.VERIFIED,
    verificationState: failedCount > 0 ? TRUST_STATES.TEMPORARY : TRUST_STATES.VERIFIED
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_execution_pipeline',
    commandId: command.id,
    packetId: null,
    eventType: 'pipeline_completed',
    status: failedCount > 0 ? 'partial_failure' : pendingApprovalCount > 0 ? 'awaiting_approvals' : 'completed',
    agent: AGENTS.JOSE,
    actionType: 'orchestration_merge_confirm',
    riskLevel: failedCount > 0 ? 'high' : pendingApprovalCount > 0 ? 'medium' : 'low',
    approved: true,
    blocked: pendingApprovalCount > 0 || failedCount > 0,
    setupRequired: false,
    details: {
      executedCount,
      pendingApprovalCount,
      failedCount,
      confirmationText
    },
    confidence: failedCount > 0 ? TRUST_STATES.INFERRED : TRUST_STATES.VERIFIED,
    verificationState: failedCount > 0 ? TRUST_STATES.TEMPORARY : TRUST_STATES.VERIFIED
  });

  return {
    ok: true,
    commandId: command.id,
    command: updatedCommand || listJoseCommands().find((item) => item.id === command.id) || command,
    executedCount,
    pendingApprovalCount,
    failedCount,
    executionReceipts,
    novaFeedback: novaHints
  };
}

export function getDLQ() {
  return joseExecutionDlq.slice().sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

export async function retryDLQ(taskId) {
  const entry = getDLQ().find((row) => row.taskId === taskId);
  if (!entry) {
    return { ok: false, reason: 'DLQ entry not found.' };
  }

  const packet = getPacketById(entry.packetId);
  if (!packet) {
    return { ok: false, reason: 'Packet not found for DLQ entry.' };
  }

  const assignment = entry.assignment || packet.payload?.assignment;
  if (!assignment) {
    return { ok: false, reason: 'Assignment data missing from DLQ entry.' };
  }

  const commandId = entry.commandId || packet.payload?.joseCommandId || null;
  const commandText = entry.commandText || packet.payload?.originalCommand || entry.instruction || '';
  const queueReason = `DLQ replay requested for ${entry.taskId}.`;

  requestPacketRetry(packet.id, queueReason);
  recordOrchestrationQueueTransition({
    commandId,
    packetId: packet.id,
    agent: AGENTS.JOSE,
    fromStatus: 'dead_letter',
    toStatus: 'queued',
    reason: queueReason,
    retryCount: Number(packet.retryCount || entry.attempts || 0),
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.PENDING
  });

  const gate = attemptPacketExecution(packet.id, {
    mode: 'jose_dlq_retry',
    actionType: assignment.actionType
  });

  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason || 'DLQ replay gate failed.',
      packet: gate.packet
    };
  }

  const draftDisabledRetry = !(await checkOllamaAvailable(entry.endpoint || undefined));
  const taskResult = await executeAssignmentWithRetries(packet, assignment, commandText, {
    endpoint: entry.endpoint || undefined,
    draftDisabled: draftDisabledRetry
  });

  if (!taskResult.ok) {
    updatePacketStatus(packet.id, 'dead_letter', {
      failureReason: taskResult.error,
      deadLetterReason: taskResult.error,
      deadLetterAtMs: timestampMs(),
      retryCount: taskResult.attempts,
      verificationState: TRUST_STATES.FAILED,
      confidence: TRUST_STATES.FAILED
    });
    recordOrchestrationQueueTransition({
      commandId,
      packetId: packet.id,
      agent: assignment.agent,
      fromStatus: 'queued',
      toStatus: 'dead_letter',
      reason: taskResult.error,
      retryCount: taskResult.attempts,
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    appendOrchestrationReceipt({
      workflowId: 'jose_execution_pipeline',
      commandId,
      packetId: packet.id,
      eventType: 'dlq_retry_failed',
      status: 'dead_letter',
      agent: assignment.agent,
      actionType: assignment.actionType,
      riskLevel: assignment.riskLevel || 'medium',
      approved: true,
      blocked: true,
      setupRequired: false,
      details: { error: taskResult.error, attempts: taskResult.attempts },
      confidence: TRUST_STATES.FAILED,
      verificationState: TRUST_STATES.FAILED
    });
    upsertJoseExecutionDlqEntry({
      ...entry,
      error: taskResult.error,
      attempts: taskResult.attempts,
      timestamp: timestampMs(),
      packetId: packet.id,
      commandId,
      assignment
    });
    return {
      ok: false,
      reason: taskResult.error,
      attempts: taskResult.attempts,
      dlqEntry: taskResult.dlqEntry || entry
    };
  }

  removeJoseExecutionDlqEntry(taskId);
  const result = taskResult.result;
  createAgentReportToJose({
    packetId: packet.id,
    reportingAgent: assignment.agent,
    summary: result.summary,
    resultState: result.resultState || 'pending_review',
    resultUrl: result.resultUrl || null,
    artifacts: result.artifacts || [],
    sources: result.sources || []
  });
  recordOrchestrationQueueTransition({
    commandId,
    packetId: packet.id,
    agent: assignment.agent,
    fromStatus: 'queued',
    toStatus: 'reported_to_jose',
    reason: 'DLQ task replayed and reported back to Jose.',
    retryCount: taskResult.attempts,
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_execution_pipeline',
    commandId,
    packetId: packet.id,
    eventType: 'dlq_retry_succeeded',
    status: 'reported_to_jose',
    agent: assignment.agent,
    actionType: assignment.actionType,
    riskLevel: assignment.riskLevel || 'low',
    approved: true,
    blocked: false,
    setupRequired: false,
    details: { attempts: taskResult.attempts, resultState: result.resultState || 'pending_review' },
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED
  });
  return {
    ok: true,
    attempts: taskResult.attempts,
    result
  };
}
