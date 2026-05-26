#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildEvaluatorPrompt,
  buildHookOutput,
  buildDelayedFeedback
} = require('./coach-core');

const PENDING_FEEDBACK_TTL_MS = 24 * 60 * 60 * 1000;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function runClaudeEvaluator(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt, '--output-format', 'json'], {
      env: {
        ...process.env,
        PROMPT_ENGLISH_COACH_INTERNAL: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Claude evaluator timed out'));
    }, 25000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `Claude evaluator exited with ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function extractClaudeResult(raw) {
  const parsed = JSON.parse(raw);
  if (typeof parsed.result === 'string') return parsed.result;
  if (typeof parsed.response === 'string') return parsed.response;
  if (typeof parsed.content === 'string') return parsed.content;
  if (typeof parsed === 'string') return parsed;
  return raw;
}

function getDataDir() {
  return (
    process.env.PROMPT_ENGLISH_COACH_DATA_DIR ||
    process.env.CLAUDE_PLUGIN_DATA ||
    path.join(os.tmpdir(), 'prompt-english-coach')
  );
}

function getSessionKey(input) {
  const raw = String(input.session_id || input.transcript_path || input.cwd || 'default');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function getPendingPath(input) {
  return path.join(getDataDir(), 'pending-feedback', `${getSessionKey(input)}.json`);
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(dirPath, 0o700);
}

function removeFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Ignore cleanup failures so the coach never blocks normal prompting.
  }
}

function isFreshPendingFile(filePath, now = Date.now()) {
  try {
    return now - fs.statSync(filePath).mtimeMs <= PENDING_FEEDBACK_TTL_MS;
  } catch {
    return false;
  }
}

function sweepStalePendingFeedback() {
  const pendingDir = path.join(getDataDir(), 'pending-feedback');
  let entries;
  try {
    entries = fs.readdirSync(pendingDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(pendingDir, entry);
    if (!isFreshPendingFile(filePath)) removeFile(filePath);
  }
}

function savePendingFeedback(input, feedback) {
  if (!feedback) return;

  sweepStalePendingFeedback();

  const pendingPath = getPendingPath(input);
  ensurePrivateDir(path.dirname(pendingPath));

  const tempPath = `${pendingPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({
    feedback,
    createdAt: new Date().toISOString()
  }), { mode: 0o600 });
  fs.renameSync(tempPath, pendingPath);
  fs.chmodSync(pendingPath, 0o600);
}

function consumePendingFeedback(input) {
  const pendingPath = getPendingPath(input);

  try {
    if (!isFreshPendingFile(pendingPath)) {
      removeFile(pendingPath);
      return '';
    }

    const payload = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    removeFile(pendingPath);
    return typeof payload.feedback === 'string' ? payload.feedback : '';
  } catch {
    return '';
  }
}

function clearPendingFeedback(input) {
  removeFile(getPendingPath(input));
}

function handleStop(input) {
  if (input.stop_hook_active === true) return;

  const feedback = consumePendingFeedback(input);
  if (!feedback) return;

  process.stdout.write(`${JSON.stringify({
    systemMessage: feedback,
    suppressOutput: true
  })}\n`);
}

async function handleUserPromptSubmit(input) {
  clearPendingFeedback(input);

  const prompt = String(input.prompt || '');
  const language = classifyPromptLanguage(prompt);
  if (!language.shouldCheck) return;

  const mode = resolveMode(process.argv, process.env);

  try {
    const raw = await runClaudeEvaluator(buildEvaluatorPrompt(prompt));
    const evaluation = parseEvaluatorJson(extractClaudeResult(raw));
    evaluation.originalPrompt = prompt;
    const output = buildHookOutput(mode, evaluation);
    if (output) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
      return;
    }

    savePendingFeedback(input, buildDelayedFeedback(mode, evaluation));
  } catch {
    return;
  }
}

async function main() {
  if (process.env.PROMPT_ENGLISH_COACH_INTERNAL === '1') return;

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }

  if (input.hook_event_name === 'Stop') {
    handleStop(input);
    return;
  }

  if (input.hook_event_name === 'StopFailure' || input.hook_event_name === 'SessionEnd') {
    clearPendingFeedback(input);
    sweepStalePendingFeedback();
    return;
  }

  if (input.hook_event_name === 'UserPromptSubmit') {
    await handleUserPromptSubmit(input);
  }
}

main();
