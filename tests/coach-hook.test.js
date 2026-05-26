'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const hookScript = path.join(repoRoot, 'plugins/prompt-english-coach/scripts/coach-hook.js');

function runHook(input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(JSON.stringify(input));
  });
}

function makeFakeClaude(evaluationByPrompt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-english-coach-'));
  const executable = path.join(dir, 'claude');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
const map = ${JSON.stringify(evaluationByPrompt)};
const key = Object.keys(map).find(candidate => prompt.includes(candidate));
if (!process.env.PROMPT_ENGLISH_COACH_INTERNAL) {
  console.error('Missing recursion guard');
  process.exit(9);
}
if (!key) {
  console.error('No fake evaluation matched');
  process.exit(2);
}
process.stdout.write(JSON.stringify({ result: JSON.stringify(map[key]) }));
`;
  fs.writeFileSync(executable, script, { mode: 0o755 });
  return dir;
}

test('hook allows Russian prompts silently without calling Claude', async () => {
  const result = await runHook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Можешь проверить этот хук?'
  }, {
    env: {
      PATH: ''
    }
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('hook returns systemMessage for coach mode and keeps prompt unblocked', async () => {
  const fakeBin = makeFakeClaude({
    'Can you check if this hook is working good?': {
      language: 'english',
      isEnglish: true,
      isMixed: false,
      hasMeaningfulIssue: true,
      severity: 'meaningful',
      corrected: 'Could you check whether this hook works correctly?',
      issues: [
        {
          kind: 'grammar',
          original: 'is working good',
          suggestion: 'works correctly',
          explanation: '"Works correctly" is the natural adverb form here.'
        }
      ],
      hint: 'Use "works correctly", not "is working good".'
    }
  });

  const result = await runHook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'coach',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, undefined);
  assert.equal(output.suppressOutput, true);
  assert.match(output.systemMessage, /English Coach:/);
  assert.match(output.systemMessage, /Suggested version/);
  assert.match(output.systemMessage, /Could you check whether this hook works correctly/);
});

test('hook blocks meaningful issues in gate mode', async () => {
  const fakeBin = makeFakeClaude({
    'Can you check if this hook is working good?': {
      language: 'english',
      isEnglish: true,
      isMixed: false,
      hasMeaningfulIssue: true,
      severity: 'meaningful',
      corrected: 'Could you check whether this hook works correctly?',
      issues: [
        {
          kind: 'grammar',
          original: 'is working good',
          suggestion: 'works correctly',
          explanation: '"Works correctly" is the natural adverb form here.'
        }
      ],
      hint: 'Use "works correctly", not "is working good".'
    }
  });

  const result = await runHook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'gate',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
  assert.equal(output.suppressOriginalPrompt, true);
  assert.equal(output.suppressOutput, true);
  assert.match(output.reason, /Please rewrite this before I continue/);
});

test('hook fails open when evaluator is unavailable', async () => {
  const result = await runHook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'gate',
      PATH: ''
    }
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
