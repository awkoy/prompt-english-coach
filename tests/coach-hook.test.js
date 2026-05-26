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

test('hook stores delayed feedback for coach mode and keeps UserPromptSubmit stdout empty', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-english-coach-data-'));
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
    session_id: 'coach-session',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'coach',
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');

  const stopResult = await runHook({
    session_id: 'coach-session',
    hook_event_name: 'Stop',
    stop_hook_active: false
  }, {
    env: {
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir
    }
  });

  assert.equal(stopResult.code, 0);
  const output = JSON.parse(stopResult.stdout);
  assert.match(output.systemMessage, /^English Coach\n/);
  assert.match(output.systemMessage, /Suggested version/);
  assert.match(output.systemMessage, /Could you check whether this hook works correctly/);
  assert.equal(output.suppressOutput, true);
});

test('stop hook consumes delayed feedback only once', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-english-coach-data-'));
  const fakeBin = makeFakeClaude({
    'Can you check if this hook is working good?': {
      language: 'english',
      isEnglish: true,
      isMixed: false,
      hasMeaningfulIssue: true,
      severity: 'meaningful',
      corrected: 'Could you check whether this hook works correctly?',
      issues: [],
      hint: 'Use "works correctly", not "is working good".'
    }
  });

  await runHook({
    session_id: 'single-use-session',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'coach',
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  const firstStop = await runHook({
    session_id: 'single-use-session',
    hook_event_name: 'Stop',
    stop_hook_active: false
  }, {
    env: {
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir
    }
  });
  const secondStop = await runHook({
    session_id: 'single-use-session',
    hook_event_name: 'Stop',
    stop_hook_active: false
  }, {
    env: {
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir
    }
  });

  assert.match(JSON.parse(firstStop.stdout).systemMessage, /^English Coach\n/);
  assert.equal(secondStop.stdout, '');
});

test('new prompt clears stale delayed feedback from an interrupted prior turn', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-english-coach-data-'));
  const fakeBin = makeFakeClaude({
    'Can you check if this hook is working good?': {
      language: 'english',
      isEnglish: true,
      isMixed: false,
      hasMeaningfulIssue: true,
      severity: 'meaningful',
      corrected: 'Could you check whether this hook works correctly?',
      issues: [],
      hint: 'Use "works correctly", not "is working good".'
    }
  });

  await runHook({
    session_id: 'interrupted-session',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Can you check if this hook is working good?'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_mode: 'coach',
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  await runHook({
    session_id: 'interrupted-session',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Можешь проверить этот хук?'
  }, {
    env: {
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir,
      PATH: ''
    }
  });

  const stopResult = await runHook({
    session_id: 'interrupted-session',
    hook_event_name: 'Stop',
    stop_hook_active: false
  }, {
    env: {
      PROMPT_ENGLISH_COACH_DATA_DIR: dataDir
    }
  });

  assert.equal(stopResult.stdout, '');
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
    session_id: 'gate-session',
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

test('hook blocks meaningful issues in strict mode from uppercase plugin env', async () => {
  const fakeBin = makeFakeClaude({
    'Hello, you is bad woman': {
      language: 'english',
      isEnglish: true,
      isMixed: false,
      hasMeaningfulIssue: true,
      severity: 'meaningful',
      corrected: 'Hello, you are a bad woman.',
      issues: [
        {
          kind: 'grammar',
          original: 'you is',
          suggestion: 'you are',
          explanation: 'Use "are" with "you".'
        }
      ],
      hint: 'Use "you are", not "you is".'
    }
  });

  const result = await runHook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Hello, you is bad woman'
  }, {
    env: {
      CLAUDE_PLUGIN_OPTION_MODE: 'strict',
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
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
