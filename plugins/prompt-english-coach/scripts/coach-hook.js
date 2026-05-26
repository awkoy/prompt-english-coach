#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const {
  resolveMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildEvaluatorPrompt,
  buildHookOutput
} = require('./coach-core');

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

async function main() {
  if (process.env.PROMPT_ENGLISH_COACH_INTERNAL === '1') return;

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }

  if (input.hook_event_name !== 'UserPromptSubmit') return;

  const prompt = String(input.prompt || '');
  const language = classifyPromptLanguage(prompt);
  if (!language.shouldCheck) return;

  const mode = resolveMode(process.argv, process.env);

  try {
    const raw = await runClaudeEvaluator(buildEvaluatorPrompt(prompt));
    const evaluation = parseEvaluatorJson(extractClaudeResult(raw));
    const output = buildHookOutput(mode, evaluation);
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    return;
  }
}

main();
