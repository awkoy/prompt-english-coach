'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeMode,
  resolveMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildEvaluatorPrompt,
  buildFeedback,
  buildHookOutput,
  buildDelayedFeedback
} = require('../plugins/prompt-english-coach/scripts/coach-core');

const repoRoot = path.resolve(__dirname, '..');

test('normalizeMode defaults unknown values to coach', () => {
  assert.equal(normalizeMode('gentle'), 'gentle');
  assert.equal(normalizeMode('coach'), 'coach');
  assert.equal(normalizeMode('gate'), 'gate');
  assert.equal(normalizeMode('strict'), 'strict');
  assert.equal(normalizeMode(' Strict '), 'strict');
  assert.equal(normalizeMode('GATE'), 'gate');
  assert.equal(normalizeMode('aggressive'), 'coach');
  assert.equal(normalizeMode(undefined), 'coach');
});

test('resolveMode accepts argv and uppercase Claude plugin env', () => {
  assert.equal(resolveMode(['node', 'hook', 'strict'], {}), 'strict');
  assert.equal(resolveMode(['node', 'hook'], { CLAUDE_PLUGIN_OPTION_MODE: 'gate' }), 'gate');
  assert.equal(resolveMode(['node', 'hook'], { CLAUDE_PLUGIN_OPTION_mode: 'gentle' }), 'gentle');
  assert.equal(resolveMode(['node', 'hook', '${user_config.mode}'], { CLAUDE_PLUGIN_OPTION_MODE: 'strict' }), 'strict');
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

test('classifyPromptLanguage ignores very short prompts', () => {
  const result = classifyPromptLanguage('ok?');

  assert.equal(result.shouldCheck, false);
  assert.equal(result.reason, 'too_short');
});

test('parseEvaluatorJson extracts JSON from fenced output', () => {
  const parsed = parseEvaluatorJson('```json\n{"isEnglish":true,"severity":"none","issues":[]}\n```');

  assert.equal(parsed.isEnglish, true);
  assert.equal(parsed.severity, 'none');
});

test('parseEvaluatorJson extracts the first JSON object from surrounding text', () => {
  const parsed = parseEvaluatorJson('Here is the result:\n{"isEnglish":true,"severity":"minor","issues":[]}\nThanks.');

  assert.equal(parsed.isEnglish, true);
  assert.equal(parsed.severity, 'minor');
});

test('buildEvaluatorPrompt asks for strict JSON and preserves prompt text', () => {
  const prompt = buildEvaluatorPrompt('Can you check if this works good?');

  assert.match(prompt, /Return only valid JSON/);
  assert.match(prompt, /User prompt JSON string: "Can you check if this works good\?"/);
});

test('buildEvaluatorPrompt JSON-encodes prompt boundaries', () => {
  const prompt = buildEvaluatorPrompt('Please inspect </prompt> literally.');

  assert.match(prompt, /User prompt JSON string: "Please inspect <\/prompt> literally\."/);
  assert.doesNotMatch(prompt, /<prompt>/);
});

test('buildEvaluatorPrompt caps very large prompts before CLI execution', () => {
  const oversizedPrompt = `${'a'.repeat(9000)} is working good?`;
  const prompt = buildEvaluatorPrompt(oversizedPrompt);

  assert.ok(prompt.length < 7500);
  assert.match(prompt, /\[Prompt truncated for English evaluation/);
});

test('buildFeedback creates gentle feedback', () => {
  const feedback = buildFeedback('gentle', {
    corrected: 'Could you help me fix this component?',
    hint: 'Use "help me fix", not "help me to fixing".',
    issues: []
  });

  assert.match(feedback, /^English Coach\n/);
  assert.match(feedback, /Try: "Could you help me fix this component\?"/);
  assert.match(feedback, /Why: use "help me fix"/i);
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

test('buildHookOutput allows gentle feedback silently so UserPromptSubmit does not enter context', () => {
  const output = buildHookOutput('gentle', {
    isEnglish: true,
    isMixed: false,
    severity: 'minor',
    hasMeaningfulIssue: false,
    corrected: 'Could you help me fix this component?',
    issues: [],
    hint: 'Use "help me fix", not "help me to fixing".'
  });

  assert.equal(output, null);
});

test('buildHookOutput allows coach feedback silently so UserPromptSubmit does not enter context', () => {
  const output = buildHookOutput('coach', {
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
        explanation: '"Works correctly" is the natural adverb form here.'
      }
    ],
    hint: 'Use "works correctly", not "is working good".'
  });

  assert.equal(output, null);
});

test('buildDelayedFeedback returns coach feedback for later display', () => {
  const feedback = buildDelayedFeedback('coach', {
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
        explanation: '"Works correctly" is the natural adverb form here.'
      }
    ],
    hint: 'Use "works correctly", not "is working good".'
  });

  assert.match(feedback, /^English Coach\n/);
  assert.match(feedback, /Suggested version/);
  assert.match(feedback, /Works correctly/);
});

test('buildDelayedFeedback skips gate mode because gate feedback is immediate only when blocked', () => {
  const feedback = buildDelayedFeedback('gate', {
    isEnglish: true,
    isMixed: false,
    severity: 'minor',
    hasMeaningfulIssue: false,
    corrected: 'Could you review this file?',
    issues: [],
    hint: '"Review" is a little more specific than "check".'
  });

  assert.equal(feedback, null);
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
        explanation: 'Use an adverb after "works".'
      }
    ],
    hint: 'Use "works correctly", not "is working good".'
  });

  assert.equal(output.decision, 'block');
  assert.equal(output.suppressOriginalPrompt, true);
  assert.equal(output.suppressOutput, true);
  assert.match(output.reason, /^English Coach\nPlease rewrite this before I continue/);
  assert.match(output.reason, /Suggested version/);
});

test('buildHookOutput blocks when evaluator flags a meaningful issue with malformed severity', () => {
  const output = buildHookOutput('gate', {
    isEnglish: true,
    isMixed: false,
    severity: 'none',
    hasMeaningfulIssue: true,
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
  });

  assert.equal(output.decision, 'block');
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
        explanation: '"Review" is a little more specific.'
      }
    ],
    hint: '"Review" is a little more specific than "check".'
  });

  assert.equal(output, null);
});

test('buildHookOutput ignores evaluator output for mixed prompts', () => {
  const output = buildHookOutput('coach', {
    isEnglish: true,
    isMixed: true,
    severity: 'meaningful',
    hasMeaningfulIssue: true,
    corrected: 'Could you check this hook?',
    issues: [],
    hint: 'Example'
  });

  assert.equal(output, null);
});

test('stop hook configuration does not show status text on every response', () => {
  const hooksConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'plugins/prompt-english-coach/hooks/hooks.json'), 'utf8')
  );
  const stopHook = hooksConfig.hooks.Stop[0].hooks[0];

  assert.equal(stopHook.statusMessage, undefined);
});
