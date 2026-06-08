import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse, generateOllamaStream } from '../lib/ollama';
import { parseJsonResponse } from './joseExecutionEngineService';
import { verifyCommandExecution } from './verificationService';
import { writeWorkspaceArtifact } from './workspaceArtifactService';
import { timestampMs, TRUST_STATES } from './trustModel';
import { pushMemoryItem } from './memoryService';
import { getModelForTask } from './modelSelectionService';
import { autoRunDevServer, getAutoRunEnabled } from './autoRunService';
import { isComposioEnabled, executeViaComposio } from './composioService';

const PATTERN_MEMORY_KEY = 'alphonso_brain_patterns_v1';
const MAX_PATTERNS = 200;
const MAX_ITERATIONS = 3;
const MAX_FILES_PER_STEP = 3;

// ─── Brain 1: Context Reader ────────────────────────────────────────────────

async function readProjectContext(projectDir) {
  if (!projectDir) return { files: [], structure: '', packageJson: null, readme: null, existingCode: {} };

  try {
    const scanResult = await invoke('scan_workspace_readiness', {
      root: projectDir,
      maxFiles: 80,
      maxFindings: 40
    });

    const files = (scanResult?.findings || [])
      .map((f) => f.path || f.file)
      .filter(Boolean)
      .slice(0, 60);

    const structure = files
      .map((f) => f.replace(projectDir, '').replace(/^[/\\]+/, ''))
      .join('\n');

    let packageJson = null;
    let readme = null;
    const existingCode = {};

    try {
      const pkgResult = await invoke('execute_command_verified', {
        program: 'node',
        args: ['-e', 'console.log(JSON.stringify(require("./package.json"), null, 2))'],
        cwd: projectDir
      });
      if (pkgResult?.success && pkgResult?.stdout) {
        packageJson = JSON.parse(pkgResult.stdout);
      }
    } catch { /* no package.json */ }

    try {
      const readmeResult = await invoke('execute_command_verified', {
        program: 'node',
        args: ['-e', 'const fs=require("fs");const p=["README.md","readme.md","Readme.md"].find(f=>fs.existsSync(f));console.log(p?fs.readFileSync(p,"utf8"):"")'],
        cwd: projectDir
      });
      if (readmeResult?.success && readmeResult?.stdout?.trim()) {
        readme = readmeResult.stdout.trim().slice(0, 2000);
      }
    } catch { /* no readme */ }

    const sourceExtensions = /\.(js|jsx|ts|tsx|py|rs|go)$/;
    const importantFiles = files
      .filter((f) => sourceExtensions.test(f) && !f.includes('node_modules') && !f.includes('.git'))
      .slice(0, 5);

    for (const filePath of importantFiles) {
      try {
        const relativePath = filePath.replace(projectDir, '').replace(/^[/\\]+/, '');
        const readResult = await invoke('execute_command_verified', {
          program: 'node',
          args: ['-e', `const fs=require("fs");const c=fs.readFileSync("${relativePath.replace(/\\/g, '/')}","utf8");console.log(c.split("\\n").slice(0,500).join("\\n"))`],
          cwd: projectDir
        });
        if (readResult?.success && readResult?.stdout) {
          existingCode[relativePath] = readResult.stdout.slice(0, 3000);
        }
      } catch { /* skip unreadable files */ }
    }

    return { files, structure, packageJson, readme, existingCode };
  } catch {
    return { files: [], structure: '', packageJson: null, readme: null, existingCode: {} };
  }
}

// ─── Brain 1b: Clarifying Questions ─────────────────────────────────────────

function needsClarification(commandText) {
  const lower = String(commandText).toLowerCase();
  const vague = /\b(app|website|project|something|stuff|thing|page)\b/.test(lower)
    && !/\b(full.?stack|dashboard|api|landing|blog|portfolio|ecommerce|chat|todo|weather|calculator|portfolio|resume|chat|messenger|weather|calculator|blog|article|ecommerce|shop|store|cart|product)\b/.test(lower);
  const tooShort = commandText.trim().split(/\s+/).length < 4;
  const noAction = !/\b(build|create|make|generate|write|scaffold|implement|develop|add|fix|update|refactor)\b/.test(lower);
  return (vague || tooShort || noAction) && commandText.trim().length < 30;
}

async function generateClarifyingQuestions(commandText, endpoint) {
  const prompt = [
    'You are Alphonso, a coding assistant. The user gave a vague request.',
    'Generate 2-4 short clarifying questions to understand what they want.',
    'Questions should cover: what kind of app, what features, what tech stack.',
    '',
    'USER REQUEST: ' + commandText,
    '',
    'Return ONLY a JSON array of strings. Example:',
    '["What kind of app do you want?", "What features should it have?"]',
    '',
    'Return ONLY the JSON array.'
  ].join('\n');

  try {
    const response = await generateOllamaResponse({ endpoint, prompt, model: getModelForTask('reason') });
    const parsed = parseJsonResponse(response?.response);
    if (Array.isArray(parsed)) return parsed.slice(0, 4);
    if (parsed?.questions && Array.isArray(parsed.questions)) return parsed.questions.slice(0, 4);
    return null;
  } catch {
    return null;
  }
}

// ─── Brain 2: Plan Preview ──────────────────────────────────────────────────

async function generatePlanPreview(commandText, projectContext, endpoint) {
  const contextSnippet = projectContext.structure
    ? `\nEXISTING PROJECT STRUCTURE:\n${projectContext.structure.slice(0, 1000)}`
    : '';

  const pkgSnippet = projectContext.packageJson
    ? `\nEXISTING DEPENDENCIES: ${Object.keys(projectContext.packageJson.dependencies || {}).join(', ') || 'none'}`
    : '';

  const existingCodeSnippet = Object.keys(projectContext.existingCode || {}).length > 0
    ? `\nEXISTING SOURCE FILES:\n${Object.entries(projectContext.existingCode).map(([p, c]) => `--- ${p} ---\n${c.slice(0, 500)}`).join('\n\n')}`
    : '';

  const prompt = [
    'You are Alphonso. Generate a plan for this coding task.',
    'Return a JSON object with: { "plan": "1-2 sentence description", "files": ["list of files to create"], "reasoning": "why this approach" }',
    '',
    'TASK: ' + commandText,
    contextSnippet,
    pkgSnippet,
    existingCodeSnippet,
    '',
    'RULES:',
    '- List specific file paths (not vague)',
    '- Max 10 files',
    '- Keep plan concise',
    '- If existing code is shown, build on it (don\'t recreate from scratch)',
    '',
    'Return ONLY the JSON object.'
  ].join('\n');

  try {
    const response = await generateOllamaResponse({ endpoint, prompt, model: getModelForTask('reason') });
    return parseJsonResponse(response?.response);
  } catch {
    return null;
  }
}

// ─── Brain 4: Pattern Memory ────────────────────────────────────────────────

function readPatterns() {
  try {
    const raw = localStorage.getItem(PATTERN_MEMORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePatterns(patterns) {
  const trimmed = patterns.slice(-MAX_PATTERNS);
  try {
    localStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(trimmed));
  } catch { /* localStorage unavailable */ }
}

function extractKeywords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12);
}

function storePattern(task, result, success) {
  const patterns = readPatterns();
  patterns.push({
    task: String(task).slice(0, 200),
    keywords: extractKeywords(task),
    success,
    filesCount: result?.filesCount || 0,
    errorSnippet: result?.error ? String(result.error).slice(0, 200) : null,
    timestampMs: timestampMs()
  });
  writePatterns(patterns);
}

function getRelevantPatterns(taskText) {
  const patterns = readPatterns();
  if (patterns.length === 0) return [];
  const keywords = extractKeywords(taskText);
  return patterns
    .map((p) => {
      const overlap = (p.keywords || []).filter((k) => keywords.includes(k)).length;
      return { ...p, relevance: overlap };
    })
    .filter((p) => p.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.timestampMs - a.timestampMs)
    .slice(0, 5);
}

// ─── Brain 3: Thinking Loop ─────────────────────────────────────────────────

function buildThinkingPrompt(taskText, planPreview, projectContext, patterns, conversationContext) {
  const contextLines = [];
  if (projectContext.structure) {
    contextLines.push(`Existing project files:\n${projectContext.structure}`);
  }
  if (projectContext.packageJson) {
    const deps = Object.keys(projectContext.packageJson.dependencies || {});
    const devDeps = Object.keys(projectContext.packageJson.devDependencies || {});
    if (deps.length) contextLines.push(`Installed dependencies: ${deps.join(', ')}`);
    if (devDeps.length) contextLines.push(`Dev dependencies: ${devDeps.join(', ')}`);
  }
  if (Object.keys(projectContext.existingCode || {}).length > 0) {
    const codePreview = Object.entries(projectContext.existingCode)
      .map(([path, content]) => `--- ${path} ---\n${content.slice(0, 800)}`)
      .join('\n\n');
    contextLines.push(`Existing source code:\n${codePreview}`);
  }
  if (patterns.length > 0) {
    const lessons = patterns.map((p) =>
      p.success
        ? `- Similar task "${p.task.slice(0, 60)}" succeeded with ${p.filesCount} files`
        : `- Similar task "${p.task.slice(0, 60)}" FAILED: ${p.errorSnippet || 'unknown error'}`
    ).join('\n');
    contextLines.push(`Lessons from past tasks:\n${lessons}`);
  }
  if (planPreview?.plan) {
    contextLines.push(`Planned approach: ${planPreview.plan}`);
  }
  if (conversationContext && conversationContext.length > 0) {
    const recentMessages = conversationContext.slice(-6);
    const contextStr = recentMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || m.text || '').slice(0, 200)}`)
      .join('\n');
    contextLines.push(`Recent conversation:\n${contextStr}`);
  }

  return [
    'You are Alphonso, a code generation agent. You write working code.',
    '',
    'RULES:',
    '1. Generate at most 3 files per response (3B model limit)',
    '2. Each file must be complete and working — no placeholders',
    '3. Use only the dependencies listed in package.json (if shown)',
    '4. Return ONLY valid JSON — no markdown, no explanation',
    '',
    'OUTPUT SCHEMA:',
    '{',
    '  "plan": "one sentence describing what you will create",',
    '  "files": [{"path": "src/App.jsx", "content": "...full file content..."}],',
    '  "commands": [{"program": "npm", "args": ["install", "package-name"]}],',
    '  "summary": "what was created"',
    '}',
    '',
    contextLines.length > 0 ? contextLines.join('\n\n') + '\n\n' : '',
    'TASK: ' + taskText,
    '',
    'Think step by step. Return ONLY the JSON object.'
  ].filter(Boolean).join('\n');
}

function buildFixPrompt(taskText, errorOutput, failedFiles) {
  return [
    'You are Alphonso. The previous code generation failed. Fix the errors.',
    '',
    'ORIGINAL TASK: ' + taskText,
    '',
    'ERRORS:',
    errorOutput.slice(0, 1500),
    '',
    'FAILED FILES:',
    ...failedFiles.map((f) => `- ${f.path}`),
    '',
    'RULES:',
    '1. Fix ONLY the files that caused errors',
    '2. Return the complete corrected file content (not a diff)',
    '3. Return at most 2 files',
    '4. Return ONLY valid JSON — no markdown',
    '',
    'OUTPUT SCHEMA:',
    '{',
    '  "plan": "what you fixed",',
    '  "files": [{"path": "src/App.jsx", "content": "...corrected content..."}],',
    '  "commands": [],',
    '  "summary": "what was fixed"',
    '}',
    '',
    'Return ONLY the JSON object.'
  ].join('\n');
}

// ─── Brain 5: Better Ollama Params ──────────────────────────────────────────

async function generateWithOptimizedParams(prompt, endpoint, taskType, onToken) {
  const model = getModelForTask(taskType || 'code');
  if (onToken) {
    return generateOllamaStream({ endpoint, model, prompt, onToken });
  }
  return generateOllamaResponse({ endpoint, prompt, model });
}

// ─── Brain 6: Multi-step Decomposition ──────────────────────────────────────

function decomposeTask(taskText) {
  const lower = String(taskText).toLowerCase();
  const steps = [];

  if (/\b(full.?stack|fullstack|mern)\b/.test(lower)) {
    steps.push(
      'Create the server entry point with Express and basic API routes',
      'Create the React client with main component and API connection',
      'Create configuration files (package.json, vite.config)'
    );
  } else if (/\b(dashboard|admin|panel)\b/.test(lower)) {
    steps.push(
      'Create the main layout and navigation component',
      'Create dashboard cards/widgets with data display',
      'Create a simple data source or mock data'
    );
  } else if (/\b(api|backend|server)\b/.test(lower)) {
    steps.push(
      'Create the server entry point with Express',
      'Create route handlers for CRUD operations',
      'Create middleware and error handling'
    );
  } else if (/\b(landing|page|website|site)\b/.test(lower)) {
    steps.push(
      'Create the main HTML structure with hero section',
      'Create CSS styles for the page',
      'Create the JavaScript for interactivity'
    );
  } else if (/\b(todo|task|list|checklist)\b/.test(lower)) {
    steps.push(
      'Create the data model and storage for tasks',
      'Create the main UI component with add/edit/delete',
      'Create the styles and layout'
    );
  } else if (/\b(portfolio|resume|cv)\b/.test(lower)) {
    steps.push(
      'Create the hero/header section with name and intro',
      'Create the projects/experience showcase section',
      'Create the contact section and styles'
    );
  } else if (/\b(chat|messenger|message)\b/.test(lower)) {
    steps.push(
      'Create the message data model and state management',
      'Create the chat UI with message list and input',
      'Create the message sending/receiving logic'
    );
  } else if (/\b(weather|forecast)\b/.test(lower)) {
    steps.push(
      'Create the weather API integration',
      'Create the UI to display weather data',
      'Create the search/input for location'
    );
  } else if (/\b(calculator|calc)\b/.test(lower)) {
    steps.push(
      'Create the calculation engine/logic',
      'Create the calculator UI with buttons and display',
      'Create history/memory features'
    );
  } else if (/\b(blog|article|cms)\b/.test(lower)) {
    steps.push(
      'Create the post/article data model',
      'Create the list view and detail view',
      'Create the editor/creation form'
    );
  } else if (/\b(ecommerce|shop|store|cart|product)\b/.test(lower)) {
    steps.push(
      'Create the product data model and listing',
      'Create the shopping cart with add/remove',
      'Create the checkout flow'
    );
  } else {
    steps.push(
      'Create the main entry point file',
      'Create supporting modules',
      'Create configuration files'
    );
  }

  return steps;
}

// ─── Brain 7: Git Operations ────────────────────────────────────────────────

async function gitAutoCommit(projectDir, message) {
  if (!projectDir) return null;
  try {
    await verifyCommandExecution('git', ['add', '-A'], projectDir);
    const result = await verifyCommandExecution('git', ['commit', '-m', message], projectDir);
    const payload = result?.payload || {};
    return { success: payload.success || payload.exitCode === 0, output: payload.stdout || payload.stderr || '' };
  } catch {
    return null;
  }
}

// ─── Main Brain Execution ───────────────────────────────────────────────────

export async function executeWithBrain(commandText, options = {}) {
  const { endpoint, projectDirectory, onProgress, previewOnly, conversationHistory, onToken } = options;
  const results = [];
  const filesWritten = [];
  const artifacts = [];
  let lastError = null;
  let streamingText = '';

  onProgress?.({ stage: 'reading_context', agent: 'alphonso', detail: 'Reading project structure and existing code' });
  const projectContext = await readProjectContext(projectDirectory);

  if (needsClarification(commandText)) {
    onProgress?.({ stage: 'clarifying', agent: 'alphonso', detail: 'Request is vague — generating questions' });
    const questions = await generateClarifyingQuestions(commandText, endpoint);
    if (questions && questions.length > 0) {
      return {
        results: [],
        filesWritten: [],
        artifacts: [{ type: 'clarifying_questions', questions }],
        steps: 0,
        success: false,
        clarificationNeeded: true,
        questions
      };
    }
  }

  onProgress?.({ stage: 'planning', agent: 'alphonso', detail: 'Generating execution plan' });
  const planPreview = await generatePlanPreview(commandText, projectContext, endpoint);
  if (planPreview) {
    artifacts.push({
      type: 'plan_preview',
      plan: planPreview.plan,
      files: planPreview.files,
      reasoning: planPreview.reasoning
    });
    results.push(`Plan: ${planPreview.plan}`);
  }

  if (previewOnly) {
    return {
      results,
      filesWritten: [],
      artifacts,
      steps: 0,
      success: true,
      plan: planPreview
    };
  }

  // ─── Composio External Tool Execution ─────────────────────────────────────
  // Detect external tool intent before falling back to code generation
  const externalToolKeywords = /\b(github|slack|notion|jira|linear|clickup|email|calendar|sheets|docs|drive|figura|twitter|x\.com|linkedin|discord|telegram|whatsapp|stripe|vercel|netlify|heroku|aws|gcp|cloudflare|sendgrid|twilio|shopify|wordpress|medium|substack|youtube|twitch|reddit|hacker.?news|product.?hunt|figma|canva|dropbox|box|evernote|airtable|asana|trello|monday|basecamp|zendesk|intercom|hubspot|salesforce|pipedrive|zapier|make|n8n|webhook|api|create.*(issue|ticket|task|pr|pull request|branch|release|deployment|notification|message|post|comment|review))\b/i;
  const isExternalToolIntent = externalToolKeywords.test(commandText);

  if (isExternalToolIntent && isComposioEnabled()) {
    onProgress?.({ stage: 'composio_lookup', agent: 'alphonso', detail: 'Checking Composio for external tool actions' });
    const composioResult = await executeViaComposio(commandText, 'alphonso', { endpoint });

    if (composioResult.success) {
      onProgress?.({ stage: 'composio_executed', agent: 'alphonso', detail: `Composio action: ${composioResult.tool}` });
      const resultText = composioResult.data
        ? JSON.stringify(composioResult.data, null, 2).slice(0, 2000)
        : 'Action completed successfully';
      results.push(`Composio executed ${composioResult.tool} via ${composioResult.toolkit}`);
      results.push(resultText);
      artifacts.push({
        type: 'composio_action',
        tool: composioResult.tool,
        toolkit: composioResult.toolkit,
        reasoning: composioResult.reasoning,
        data: composioResult.data
      });

      // If Composio handled it fully, return early
      if (!composioResult.fallback) {
        pushMemoryItem({
          title: `Composio: ${composioResult.tool}`,
          category: 'orchestration_memory',
          content: { command: commandText.slice(0, 200), tool: composioResult.tool, success: true },
          source: 'composio-connector',
          sourceAgent: 'alphonso',
          confidence: TRUST_STATES.VERIFIED
        });
        return {
          results,
          filesWritten: [],
          artifacts,
          steps: 1,
          success: true,
          composioUsed: true
        };
      }
    } else if (composioResult.error && !composioResult.fallback) {
      results.push(`Composio attempt failed: ${composioResult.error}`);
      artifacts.push({
        type: 'composio_failed',
        error: composioResult.error,
        reasoning: composioResult.reasoning
      });
      // Fall through to code generation
    }
  }

  const patterns = getRelevantPatterns(commandText);
  const steps = decomposeTask(commandText);

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    onProgress?.({ stage: 'generating', agent: 'alphonso', detail: `Step ${stepIdx + 1}/${steps.length}: ${step}` });

    let iteration = 0;
    let stepSuccess = false;

    while (iteration < MAX_ITERATIONS && !stepSuccess) {
      iteration++;
      const stepPrompt = buildThinkingPrompt(
        `${commandText}\n\nSub-task: ${step}`,
        planPreview,
        projectContext,
        patterns,
        conversationHistory
      );

      try {
        const handleToken = onToken
          ? (token, full) => {
              streamingText = full;
              onToken({ step: stepIdx + 1, iteration, token, fullText: full });
            }
          : undefined;
        const response = await generateWithOptimizedParams(stepPrompt, endpoint, 'code', handleToken);
        streamingText = '';
        const parsed = parseJsonResponse(response?.response || response);

        if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
          results.push(`Step ${stepIdx + 1} iteration ${iteration}: No valid JSON response`);
          continue;
        }

        const stepFiles = parsed.files.slice(0, MAX_FILES_PER_STEP);
        for (const file of stepFiles) {
          if (file.path && file.content) {
            const safePath = String(file.path).replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
            try {
              await writeWorkspaceArtifact({
                workspaceRoot: projectDirectory || '',
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

        if (Array.isArray(parsed.commands)) {
          for (const cmd of parsed.commands) {
            if (cmd.program && Array.isArray(cmd.args)) {
              const execProof = await verifyCommandExecution(cmd.program, cmd.args, projectDirectory);
              const payload = execProof?.payload || {};
              const cmdSuccess = payload.success === true || payload.exitCode === 0;
              results.push(`Command: ${cmd.program} ${cmd.args.join(' ')} — exit ${payload.exitCode ?? '?'}`);
              if (!cmdSuccess && payload.stderr) {
                lastError = payload.stderr;
              }
            }
          }
        }

        stepSuccess = true;
        artifacts.push({
          type: 'brain_generation',
          step: stepIdx + 1,
          stepText: step,
          iteration,
          filesGenerated: stepFiles.map((f) => f.path),
          plan: parsed.plan || null
        });

      } catch (genError) {
        lastError = String(genError?.message || genError);
        results.push(`Step ${stepIdx + 1} iteration ${iteration} failed: ${lastError}`);
      }
    }

    if (!stepSuccess && lastError && filesWritten.length > 0) {
      onProgress?.({ stage: 'fixing', agent: 'alphonso', detail: 'Attempting error correction' });
      try {
        const fixPrompt = buildFixPrompt(commandText, lastError, filesWritten.map((p) => ({ path: p })));
        const handleToken = onToken
          ? (token, full) => { onToken({ step: 'fix', token, fullText: full }); }
          : undefined;
        const fixResponse = await generateWithOptimizedParams(fixPrompt, endpoint, 'code', handleToken);
        const fixParsed = parseJsonResponse(fixResponse?.response || fixResponse);

        if (fixParsed && Array.isArray(fixParsed.files)) {
          for (const file of fixParsed.files.slice(0, 2)) {
            if (file.path && file.content) {
              const safePath = String(file.path).replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
              await writeWorkspaceArtifact({
                workspaceRoot: projectDirectory || '',
                relativePath: safePath,
                content: String(file.content)
              });
              results.push(`Fixed: ${safePath}`);
            }
          }
        }
      } catch {
        // fix attempt failed, continue
      }
    }
  }

  if (filesWritten.length > 0 && projectDirectory) {
    onProgress?.({ stage: 'committing', agent: 'alphonso', detail: 'Auto-committing changes' });
    const commitResult = await gitAutoCommit(projectDirectory, `Alphonso: ${commandText.slice(0, 72)}`);
    if (commitResult?.success) {
      results.push(`Git commit: ${commitResult.output.slice(0, 100)}`);
      artifacts.push({ type: 'git_commit', message: `Alphonso: ${commandText.slice(0, 72)}`, output: commitResult.output });
    }
  }

  let autoRunResult = null;
  if (filesWritten.length > 0 && projectDirectory && getAutoRunEnabled()) {
    const hasPackageJson = filesWritten.some((f) => f === 'package.json' || f.endsWith('/package.json'));
    const hasDevScript = projectContext.packageJson?.scripts?.dev;
    if (hasPackageJson || hasDevScript) {
      onProgress?.({ stage: 'auto_run', agent: 'alphonso', detail: 'Auto-running dev server' });
      autoRunResult = await autoRunDevServer(projectDirectory);
      if (autoRunResult) {
        results.push(autoRunResult.success ? `Dev server started${autoRunResult.url ? ` at ${autoRunResult.url}` : ''}` : 'Dev server failed to start');
        artifacts.push({ type: 'auto_run', success: autoRunResult.success, url: autoRunResult.url, output: autoRunResult.output?.slice(0, 500) });
      }
    }
  }

  storePattern(commandText, { filesCount: filesWritten.length, error: lastError }, filesWritten.length > 0);

  if (filesWritten.length > 0) {
    pushMemoryItem({
      title: `Alphonso built: ${commandText.slice(0, 80)}`,
      category: 'code_generation',
      content: {
        task: commandText.slice(0, 200),
        files: filesWritten,
        steps: steps.length,
        success: filesWritten.length > 0
      },
      source: 'agent-brain',
      sourceAgent: 'alphonso',
      confidence: TRUST_STATES.INFERRED,
      verificationState: TRUST_STATES.UNVERIFIED
    });
  }

  return {
    results,
    filesWritten,
    artifacts,
    steps: steps.length,
    success: filesWritten.length > 0,
    autoRunUrl: autoRunResult?.url || null,
    error: lastError
  };
}

export { readProjectContext, getRelevantPatterns, decomposeTask, needsClarification, gitAutoCommit, generatePlanPreview, buildThinkingPrompt };
