import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../lib/ollama';
import { parseJsonResponse } from './joseExecutionEngineService';
import { verifyCommandExecution } from './verificationService';
import { writeWorkspaceArtifact } from './workspaceArtifactService';
import { timestampMs, TRUST_STATES } from './trustModel';
import { pushMemoryItem } from './memoryService';

const PATTERN_MEMORY_KEY = 'alphonso_brain_patterns_v1';
const MAX_PATTERNS = 200;
const MAX_ITERATIONS = 3;

// ─── Brain 1: Context Reader ────────────────────────────────────────────────

async function readProjectContext(projectDir) {
  if (!projectDir) return { files: [], structure: '', packageJson: null };

  try {
    const scanResult = await invoke('scan_workspace_readiness', {
      root: projectDir,
      maxFiles: 50,
      maxFindings: 20
    });

    const files = (scanResult?.findings || [])
      .map((f) => f.path || f.file)
      .filter(Boolean)
      .slice(0, 30);

    const structure = files
      .map((f) => f.replace(projectDir, '').replace(/^[/\\]+/, ''))
      .join('\n');

    let packageJson = null;
    try {
      const pkgResult = await invoke('execute_command_verified', {
        program: 'node',
        args: ['-e', 'console.log(JSON.stringify(require("./package.json"), null, 2))'],
        cwd: projectDir
      });
      if (pkgResult?.success && pkgResult?.stdout) {
        packageJson = JSON.parse(pkgResult.stdout);
      }
    } catch {
      // package.json doesn't exist or can't be read
    }

    return { files, structure, packageJson };
  } catch {
    return { files: [], structure: '', packageJson: null };
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

function storePattern(task, result, success) {
  const patterns = readPatterns();
  patterns.push({
    task: String(task).slice(0, 200),
    success,
    filesCount: result?.filesCount || 0,
    errorSnippet: result?.error ? String(result.error).slice(0, 200) : null,
    timestampMs: timestampMs()
  });
  writePatterns(patterns);
}

function getRelevantPatterns(taskText) {
  const patterns = readPatterns();
  const lower = String(taskText).toLowerCase();
  return patterns
    .filter((p) => {
      const pLower = String(p.task).toLowerCase();
      return lower.split(/\s+/).some((word) => word.length > 3 && pLower.includes(word));
    })
    .slice(-5);
}

// ─── Brain 2: Thinking Loop ─────────────────────────────────────────────────

function buildThinkingPrompt(taskText, context, projectContext, patterns) {
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
  if (patterns.length > 0) {
    const lessons = patterns.map((p) =>
      p.success
        ? `- Similar task "${p.task.slice(0, 60)}" succeeded with ${p.filesCount} files`
        : `- Similar task "${p.task.slice(0, 60)}" FAILED: ${p.errorSnippet || 'unknown error'}`
    ).join('\n');
    contextLines.push(`Lessons from past tasks:\n${lessons}`);
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

async function generateWithOptimizedParams(prompt, endpoint) {
  return generateOllamaResponse({ endpoint, prompt });
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
  } else {
    steps.push(
      'Create the main entry point file',
      'Create supporting modules',
      'Create configuration files'
    );
  }

  return steps;
}

// ─── Main Brain Execution ───────────────────────────────────────────────────

export async function executeWithBrain(commandText, options = {}) {
  const { endpoint, projectDirectory, onProgress } = options;
  const results = [];
  const filesWritten = [];
  const artifacts = [];
  let lastError = null;

  // Step 1: Read project context
  onProgress?.({ stage: 'reading_context', agent: 'alphonso', detail: 'Reading project structure' });
  const projectContext = await readProjectContext(projectDirectory);

  // Step 2: Get relevant patterns from memory
  const patterns = getRelevantPatterns(commandText);

  // Step 3: Decompose into steps
  const steps = decomposeTask(commandText);
  onProgress?.({ stage: 'planning', agent: 'alphonso', detail: `Plan: ${steps.join(' → ')}` });

  // Step 4: Execute each step with thinking loop
  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    onProgress?.({ stage: 'generating', agent: 'alphonso', detail: `Step ${stepIdx + 1}/${steps.length}: ${step}` });

    let iteration = 0;
    let stepSuccess = false;

    while (iteration < MAX_ITERATIONS && !stepSuccess) {
      iteration++;
      const stepPrompt = buildThinkingPrompt(
        `${commandText}\n\nSub-task: ${step}`,
        null,
        projectContext,
        patterns
      );

      try {
        const response = await generateWithOptimizedParams(stepPrompt, endpoint);
        const parsed = parseJsonResponse(response?.response);

        if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
          results.push(`Step ${stepIdx + 1} iteration ${iteration}: No valid JSON response`);
          continue;
        }

        // Write files (max 3 per step)
        const stepFiles = parsed.files.slice(0, 3);
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

        // Execute commands
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

    // Step 5: Error feedback loop — if step failed all iterations, try fix
    if (!stepSuccess && lastError && filesWritten.length > 0) {
      onProgress?.({ stage: 'fixing', agent: 'alphonso', detail: 'Attempting error correction' });
      try {
        const fixPrompt = buildFixPrompt(commandText, lastError, filesWritten.map((p) => ({ path: p })));
        const fixResponse = await generateWithOptimizedParams(fixPrompt, endpoint);
        const fixParsed = parseJsonResponse(fixResponse?.response);

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

  // Step 6: Store pattern for future learning
  storePattern(commandText, { filesCount: filesWritten.length, error: lastError }, filesWritten.length > 0);

  // Step 7: Persist to memory
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
    success: filesWritten.length > 0
  };
}

export { readProjectContext, getRelevantPatterns, decomposeTask };
