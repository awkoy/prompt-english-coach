# Prompt English Coach Implementation Plan

> Historical note: this plan records the original implementation sequence. The current plugin uses delayed non-blocking feedback through `Stop`, plus cleanup through `StopFailure` and `SessionEnd`; use `02-design.md` and the current tests as the source of truth before re-executing any old snippets below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Prompt English Coach as a full working, distributable Claude Code plugin that gives English-learning feedback for English prompts and can gate meaningful grammar or clarity issues.

**Architecture:** The plugin is distributed through a Claude Code marketplace repo. A `UserPromptSubmit` command hook runs a bundled Node.js script, detects prompt language, invokes the local Claude CLI for structured evaluation, blocks gate-mode prompts when needed, and stores non-blocking feedback for a later `Stop` hook.

**Tech Stack:** Claude Code plugin system, Claude Code hooks, Node.js CommonJS, Node built-in `node:test`, JSON manifests.

---

## File Structure

- Create `.claude-plugin/marketplace.json`: marketplace catalog for the repository.
- Create `plugins/prompt-english-coach/.claude-plugin/plugin.json`: plugin metadata and user configuration. Do not set `hooks` for the standard `hooks/hooks.json` file because Claude Code loads it automatically.
- Create `plugins/prompt-english-coach/hooks/hooks.json`: `UserPromptSubmit` hook registration.
- Create `plugins/prompt-english-coach/scripts/coach-core.js`: pure functions for mode normalization, language heuristics, evaluator prompt construction, evaluator parsing, and hook output formatting.
- Create `plugins/prompt-english-coach/scripts/coach-hook.js`: stdin/stdout hook executable that calls `coach-core.js` and the local Claude CLI.
- Create `plugins/prompt-english-coach/examples/*.json`: sample hook payloads.
- Create `tests/coach-core.test.js`: fast unit tests for pure behavior.
- Create `package.json`: local test and validation scripts.
- Create `README.md`: marketplace-level overview and install instructions.
- Create `plugins/prompt-english-coach/README.md`: plugin-level usage, configuration, examples, troubleshooting.
- Create `LICENSE`: project license.

## Task 1: Root Project Metadata

**Files:**

- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "prompt-english-coach-marketplace",
  "version": "0.1.0",
  "private": true,
  "description": "Claude Code plugin marketplace for Prompt English Coach.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "validate:json": "node -e \"for (const f of ['.claude-plugin/marketplace.json','plugins/prompt-english-coach/.claude-plugin/plugin.json','plugins/prompt-english-coach/hooks/hooks.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON manifests are valid')\"",
    "validate": "npm run validate:json && npm test"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create gitignore**

Create `.gitignore`:

```gitignore
node_modules/
.DS_Store
coverage/
.claude/settings.local.json
```

- [ ] **Step 3: Create license**

Create `LICENSE` with the MIT License text and copyright holder `Prompt English Coach contributors`.

- [ ] **Step 4: Record validation status**

Run:

```bash
npm run validate:json
```

Expected at this point:

```text
ENOENT
```

This is the correct failure because the manifests are created in Tasks 2 and 3. The same command must pass after Task 3.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore LICENSE
git commit -m "chore: add project metadata"
```

## Task 2: Marketplace and Plugin Manifests

**Files:**

- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/prompt-english-coach/.claude-plugin/plugin.json`

- [ ] **Step 1: Create marketplace manifest**

Create `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "prompt-english-coach",
  "owner": {
    "name": "Prompt English Coach contributors"
  },
  "description": "Claude Code plugins for deliberate English practice in prompts.",
  "plugins": [
    {
      "name": "prompt-english-coach",
      "source": "./plugins/prompt-english-coach",
      "description": "A supportive English teacher for Claude Code prompts.",
      "version": "0.1.0",
      "license": "MIT",
      "keywords": ["english", "writing", "prompts", "learning", "hooks"],
      "category": "productivity"
    }
  ]
}
```

- [ ] **Step 2: Create plugin manifest**

Create `plugins/prompt-english-coach/.claude-plugin/plugin.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "prompt-english-coach",
  "displayName": "Prompt English Coach",
  "description": "A supportive English teacher for Claude Code prompts.",
  "version": "0.1.0",
  "license": "MIT",
  "keywords": ["english", "coach", "writing", "prompt", "hook"],
  "userConfig": {
    "mode": {
      "type": "string",
      "title": "Coaching mode",
      "description": "How strongly Prompt English Coach should intervene: gentle, coach, gate, or strict.",
      "default": "coach",
      "required": false
    }
  }
}
```

- [ ] **Step 3: Validate JSON**

Run:

```bash
npm run validate:json
```

Expected after Task 3 is complete:

```text
JSON manifests are valid
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json plugins/prompt-english-coach/.claude-plugin/plugin.json
git commit -m "feat: add marketplace and plugin manifests"
```

## Task 3: Hook Registration

**Files:**

- Create: `plugins/prompt-english-coach/hooks/hooks.json`

- [ ] **Step 1: Create hook config**

Create `plugins/prompt-english-coach/hooks/hooks.json`:

```json
{
  "description": "Prompt English Coach checks English prompts on UserPromptSubmit.",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/coach-hook.js"],
            "timeout": 30,
            "statusMessage": "Checking prompt English"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

Run:

```bash
npm run validate:json
```

Expected:

```text
JSON manifests are valid
```

- [ ] **Step 3: Commit**

```bash
git add plugins/prompt-english-coach/hooks/hooks.json
git commit -m "feat: register prompt coaching hook"
```

## Task 4: Core Behavior Tests

**Files:**

- Create: `tests/coach-core.test.js`
- Create later in Task 5: `plugins/prompt-english-coach/scripts/coach-core.js`

- [ ] **Step 1: Write failing tests**

Create `tests/coach-core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildFeedback,
  buildHookOutput
} = require('../plugins/prompt-english-coach/scripts/coach-core');

test('normalizeMode defaults unknown values to coach', () => {
  assert.equal(normalizeMode('gentle'), 'gentle');
  assert.equal(normalizeMode('coach'), 'coach');
  assert.equal(normalizeMode('gate'), 'gate');
  assert.equal(normalizeMode('strict'), 'strict');
  assert.equal(normalizeMode('aggressive'), 'coach');
  assert.equal(normalizeMode(undefined), 'coach');
});

test('classifyPromptLanguage recognizes primarily English prompts', () => {
  const result = classifyPromptLanguage('Could you check whether this hook works correctly?');
  assert.equal(result.shouldCheck, true);
  assert.equal(result.reason, 'primarily_english');
});

test('classifyPromptLanguage ignores Russian prompts', () => {
  const result = classifyPromptLanguage('Можешь проверить этот хук?');
  assert.equal(result.shouldCheck, false);
  assert.equal(result.reason, 'non_english');
});

test('classifyPromptLanguage ignores mixed prompts', () => {
  const result = classifyPromptLanguage('Можешь check this hook and explain результат?');
  assert.equal(result.shouldCheck, false);
  assert.equal(result.reason, 'mixed_language');
});

test('parseEvaluatorJson extracts JSON from fenced output', () => {
  const parsed = parseEvaluatorJson('```json\\n{\"isEnglish\":true,\"severity\":\"none\",\"issues\":[]}\\n```');
  assert.equal(parsed.isEnglish, true);
  assert.equal(parsed.severity, 'none');
});

test('buildHookOutput allows clean English silently', () => {
  const output = buildHookOutput('coach', {
    isEnglish: true,
    isMixed: false,
    severity: 'none',
    hasMeaningfulIssue: false,
    corrected: '',
    issues: [],
    hint: ''
  });
  assert.equal(output, null);
});

test('buildHookOutput adds concise context in gentle mode', () => {
  const output = buildHookOutput('gentle', {
    isEnglish: true,
    isMixed: false,
    severity: 'minor',
    hasMeaningfulIssue: false,
    corrected: 'Could you help me fix this component?',
    issues: [],
    hint: 'Use \"help me fix\", not \"help me to fixing\".'
  });
  assert.match(output.systemMessage, /^English Coach\n/);
  assert.match(output.systemMessage, /Try:/);
  assert.doesNotMatch(JSON.stringify(output), /"decision":"block"/);
});

test('buildHookOutput blocks meaningful issues in gate mode', () => {
  const output = buildHookOutput('gate', {
    isEnglish: true,
    isMixed: false,
    severity: 'meaningful',
    hasMeaningfulIssue: true,
    corrected: 'Could you check whether this hook works correctly?',
    issues: [
      {
        kind: 'grammar',
        original: 'is working good',
        suggestion: 'works correctly',
        explanation: 'Use an adverb after works.'
      }
    ],
    hint: 'Use \"works correctly\", not \"is working good\".'
  });
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /Please rewrite this before I continue/);
  assert.match(output.reason, /Suggested version/);
});

test('buildHookOutput does not block minor style issues in gate mode', () => {
  const output = buildHookOutput('gate', {
    isEnglish: true,
    isMixed: false,
    severity: 'minor',
    hasMeaningfulIssue: false,
    corrected: 'Could you review this file?',
    issues: [
      {
        kind: 'style',
        original: 'check',
        suggestion: 'review',
        explanation: 'Review is a little more specific.'
      }
    ],
    hint: 'Review is a little more specific than check.'
  });
  assert.equal(output, null);
});
```

- [ ] **Step 2: Run tests and verify they fail because core module is missing**

Run:

```bash
npm test
```

Expected:

```text
Error: Cannot find module '../plugins/prompt-english-coach/scripts/coach-core'
```

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/coach-core.test.js
git commit -m "test: define prompt coaching core behavior"
```

## Task 5: Core Behavior Implementation

**Files:**

- Create: `plugins/prompt-english-coach/scripts/coach-core.js`

- [ ] **Step 1: Implement core module**

Create `plugins/prompt-english-coach/scripts/coach-core.js` with these exported functions:

```js
'use strict';

const VALID_MODES = new Set(['gentle', 'coach', 'gate', 'strict']);

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : 'coach';
}

function classifyPromptLanguage(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return { shouldCheck: false, reason: 'empty' };

  const latinMatches = text.match(/[A-Za-z]/g) || [];
  const cyrillicMatches = text.match(/[\\u0400-\\u04FF]/g) || [];
  const letterCount = latinMatches.length + cyrillicMatches.length;

  if (letterCount < 8) return { shouldCheck: false, reason: 'too_short' };

  const latinRatio = latinMatches.length / letterCount;
  const cyrillicRatio = cyrillicMatches.length / letterCount;

  if (latinRatio >= 0.8 && cyrillicRatio <= 0.05) {
    return { shouldCheck: true, reason: 'primarily_english' };
  }

  if (latinRatio >= 0.25 && cyrillicRatio >= 0.15) {
    return { shouldCheck: false, reason: 'mixed_language' };
  }

  return { shouldCheck: false, reason: 'non_english' };
}

function stripJsonFence(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\\s*/i, '')
    .replace(/\\s*```$/i, '')
    .trim();
}

function parseEvaluatorJson(value) {
  return JSON.parse(stripJsonFence(value));
}

function cleanLine(value) {
  return String(value || '').replace(/\\s+/g, ' ').trim();
}

function buildFeedback(mode, evaluation) {
  const corrected = cleanLine(evaluation.corrected);
  const hint = cleanLine(evaluation.hint);
  const issues = Array.isArray(evaluation.issues) ? evaluation.issues.slice(0, mode === 'strict' ? 4 : 3) : [];

  if (mode === 'gentle') {
    const lines = ['English Coach'];
    if (corrected) lines.push(`Try: \"${corrected}\"`);
    if (hint) lines.push(`Why: ${hint}`);
    return lines.join('\\n');
  }

  const lines = ['English Coach'];
  if (corrected) {
    lines.push('', 'Suggested version:', `\"${corrected}\"`);
  }
  if (issues.length > 0) {
    lines.push('', 'Focus:');
    for (const issue of issues) {
      const explanation = cleanLine(issue.explanation || issue.suggestion || issue.original);
      if (explanation) lines.push(`- ${explanation}`);
    }
  } else if (hint) {
    lines.push('', `Focus: ${hint}`);
  }
  return lines.join('\\n');
}

function hasMeaningfulIssue(evaluation) {
  return evaluation.hasMeaningfulIssue === true || evaluation.severity === 'meaningful';
}

function buildHookOutput(modeValue, evaluation) {
  const mode = normalizeMode(modeValue);

  if (!evaluation || evaluation.isEnglish !== true || evaluation.isMixed === true) {
    return null;
  }

  if (evaluation.severity === 'none' || !evaluation.severity) {
    return null;
  }

  const shouldBlock = (mode === 'gate' || mode === 'strict') && hasMeaningfulIssue(evaluation);

  if (shouldBlock) {
    const feedback = buildFeedback(mode, evaluation);
    return {
      decision: 'block',
      reason: feedback.replace('English Coach', 'English Coach\\nPlease rewrite this before I continue.')
    };
  }

  if (mode === 'gate' || mode === 'strict') {
    return null;
  }

  return {
    systemMessage: buildFeedback(mode, evaluation)
  };
}

function buildEvaluatorPrompt(userPrompt) {
  return [
    'You are Prompt English Coach, a concise supportive English teacher for developer prompts.',
    'Analyze only the user prompt inside <prompt> tags.',
    'Return only valid JSON. Do not use markdown.',
    'Ignore non-English and mixed-language prompts.',
    'Do not shame the user. Be concise and practical.',
    'Classify severity as none, minor, or meaningful.',
    'Meaningful means grammar or clarity problems that can confuse the request.',
    'Minor means style preference or harmless awkward phrasing.',
    'Gate modes must block only meaningful issues.',
    '',
    'Required JSON keys: language, isEnglish, isMixed, hasMeaningfulIssue, severity, corrected, issues, hint.',
    'issues must be an array of objects with kind, original, suggestion, explanation.',
    '',
    `<prompt>${userPrompt}</prompt>`
  ].join('\\n');
}

module.exports = {
  normalizeMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildFeedback,
  buildHookOutput,
  buildEvaluatorPrompt
};
```

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected:

```text
# pass
```

- [ ] **Step 3: Commit**

```bash
git add plugins/prompt-english-coach/scripts/coach-core.js tests/coach-core.test.js
git commit -m "feat: implement prompt coaching core"
```

## Task 6: Hook Executable

**Files:**

- Create: `plugins/prompt-english-coach/scripts/coach-hook.js`
- Modify: `tests/coach-core.test.js`

- [ ] **Step 1: Add tests for evaluator prompt**

Append this test to `tests/coach-core.test.js`:

```js
test('buildEvaluatorPrompt asks for strict JSON and preserves prompt text', () => {
  const { buildEvaluatorPrompt } = require('../plugins/prompt-english-coach/scripts/coach-core');
  const prompt = buildEvaluatorPrompt('Can you check if this works good?');
  assert.match(prompt, /Return only valid JSON/);
  assert.match(prompt, /<prompt>Can you check if this works good\\?<\\/prompt>/);
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm test
```

Expected:

```text
# pass
```

- [ ] **Step 3: Create hook script**

Create `plugins/prompt-english-coach/scripts/coach-hook.js`:

```js
#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const {
  normalizeMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildHookOutput,
  buildEvaluatorPrompt
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

  const mode = normalizeMode(process.env.CLAUDE_PLUGIN_OPTION_mode);

  try {
    const raw = await runClaudeEvaluator(buildEvaluatorPrompt(prompt));
    const evaluation = parseEvaluatorJson(extractClaudeResult(raw));
    const output = buildHookOutput(mode, evaluation);
    if (output) process.stdout.write(`${JSON.stringify(output)}\\n`);
  } catch {
    return;
  }
}

main();
```

- [ ] **Step 4: Make hook script executable**

Run:

```bash
chmod +x plugins/prompt-english-coach/scripts/coach-hook.js
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected:

```text
# pass
```

- [ ] **Step 6: Commit**

```bash
git add plugins/prompt-english-coach/scripts/coach-hook.js plugins/prompt-english-coach/scripts/coach-core.js tests/coach-core.test.js
git commit -m "feat: add prompt coaching hook executable"
```

## Task 7: Examples and Manual Fixtures

**Files:**

- Create: `plugins/prompt-english-coach/examples/english-clean.json`
- Create: `plugins/prompt-english-coach/examples/english-issue.json`
- Create: `plugins/prompt-english-coach/examples/russian.json`
- Create: `plugins/prompt-english-coach/examples/mixed.json`

- [ ] **Step 1: Create clean English fixture**

Create `plugins/prompt-english-coach/examples/english-clean.json`:

```json
{
  "session_id": "example",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/tmp/project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Could you check whether this hook works correctly?"
}
```

- [ ] **Step 2: Create English issue fixture**

Create `plugins/prompt-english-coach/examples/english-issue.json`:

```json
{
  "session_id": "example",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/tmp/project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Can you check if this hook is working good?"
}
```

- [ ] **Step 3: Create Russian fixture**

Create `plugins/prompt-english-coach/examples/russian.json`:

```json
{
  "session_id": "example",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/tmp/project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Можешь проверить, правильно ли работает этот хук?"
}
```

- [ ] **Step 4: Create mixed-language fixture**

Create `plugins/prompt-english-coach/examples/mixed.json`:

```json
{
  "session_id": "example",
  "transcript_path": "/tmp/transcript.jsonl",
  "cwd": "/tmp/project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Можешь check this hook and explain результат?"
}
```

- [ ] **Step 5: Validate JSON**

Run:

```bash
node -e "for (const f of require('fs').readdirSync('plugins/prompt-english-coach/examples').map(x => 'plugins/prompt-english-coach/examples/' + x)) JSON.parse(require('fs').readFileSync(f, 'utf8')); console.log('Example fixtures are valid')"
```

Expected:

```text
Example fixtures are valid
```

- [ ] **Step 6: Commit**

```bash
git add plugins/prompt-english-coach/examples
git commit -m "test: add hook input examples"
```

## Task 8: Documentation

**Files:**

- Create: `README.md`
- Create: `plugins/prompt-english-coach/README.md`

- [ ] **Step 1: Create root README**

Create `README.md` with sections:

```md
# Prompt English Coach

Prompt English Coach is a Claude Code plugin that turns English prompts into deliberate English practice.

Unlike auto-correct plugins, it does not silently rewrite your prompt before Claude sees it. It teaches you what to improve, and in gate mode it asks you to rewrite the prompt yourself before continuing.

## Install

```text
/plugin marketplace add awkoy/prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
```

For local development:

```text
/plugin marketplace add ./prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
```

## Plugin

See `plugins/prompt-english-coach/README.md`.

## Development

```bash
npm run validate
```

## License

MIT
```
```

- [ ] **Step 2: Create plugin README**

Create `plugins/prompt-english-coach/README.md` with sections:

```md
# Prompt English Coach

A supportive English teacher for Claude Code prompts.

## What it does

- Checks prompts that are primarily English.
- Ignores Russian, non-English, and mixed-language prompts.
- Gives concise, practical feedback.
- Never auto-corrects the prompt before Claude sees it.
- Can block meaningful grammar or clarity issues in gate modes.

## Modes

| Mode | Blocks? | Behavior |
| --- | --- | --- |
| `gentle` | No | Shows one short hint. |
| `coach` | No | Shows a corrected version and one to three explanations. |
| `gate` | Yes, for meaningful issues | Asks you to rewrite the prompt yourself. |
| `strict` | Yes, for meaningful issues | Same gate threshold with more complete feedback. |

Gate modes do not block minor style preferences.

## Examples

Gentle:

```text
English Coach
Try: "Could you help me fix this component?"
Why: use "help me fix", not "help me to fixing".
```

Gate:

```text
English Coach
Please rewrite this before I continue.

Suggested version:
"Could you check whether this hook works correctly?"

Focus:
- Use "whether" for indirect yes/no questions.
- "Works correctly" sounds more natural than "is working good".
```

## Requirements

- Claude Code installed and authenticated.
- Node.js 18 or newer.
- The `claude` CLI available on PATH.

## Troubleshooting

If feedback does not appear, run `/hooks` in Claude Code and confirm the `UserPromptSubmit` hook is registered.

If the internal Claude evaluator fails, the hook allows the prompt to continue. This prevents the coach from breaking the coding workflow.
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md plugins/prompt-english-coach/README.md
git commit -m "docs: document prompt english coach"
```

## Task 9: Final Validation

**Files:**

- Modify only files that fail validation.

- [ ] **Step 1: Run automated validation**

Run:

```bash
npm run validate
```

Expected:

```text
JSON manifests are valid
# pass
```

- [ ] **Step 2: Run Claude plugin validation when CLI is available**

Run:

```bash
claude plugin validate .
```

Expected:

```text
Validation successful
```

If the local Claude CLI prints a different success line, record the exact success line in the final implementation notes.

- [ ] **Step 3: Test local marketplace install manually**

Inside Claude Code from a separate test session, run:

```text
/plugin marketplace add awkoy/prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
/hooks
```

Expected:

- The marketplace is added.
- The plugin installs.
- `/hooks` shows `UserPromptSubmit`, `Stop`, `StopFailure`, and `SessionEnd` hooks from `prompt-english-coach`.

- [ ] **Step 4: Manual behavior check**

Submit these prompts in Claude Code:

```text
Could you check whether this hook works correctly?
```

Expected: no block.

```text
Can you check if this hook is working good?
```

Expected in `coach`: non-blocking English Coach feedback.

Expected in `gate`: block with rewrite request.

```text
Можешь проверить этот хук?
```

Expected: no English Coach feedback.

- [ ] **Step 5: Commit final fixes**

```bash
git status --short
git add .
git commit -m "chore: validate prompt english coach plugin"
```

## Self-Review Checklist

- Every requirement in `01-goal.md` maps to a task in this plan.
- The plan uses command hook architecture because full non-blocking feedback needs Claude Code hook JSON control.
- Gate and strict modes block only `meaningful` issues.
- The hook fails open on evaluator errors.
- The internal Claude CLI invocation is guarded with `PROMPT_ENGLISH_COACH_INTERNAL=1`.
- Tests are written before core implementation.
- JSON validation is included.
- Manual Claude Code installation validation is included.
