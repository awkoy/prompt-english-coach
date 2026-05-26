'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildEvaluatorPrompt,
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

test('buildFeedback creates gentle feedback', () => {
  const feedback = buildFeedback('gentle', {
    corrected: 'Could you help me fix this component?',
    hint: 'Use "help me fix", not "help me to fixing".',
    issues: []
  });

  assert.match(feedback, /English Coach:/);
  assert.match(feedback, /Try: "Could you help me fix this component\?"/);
  assert.match(feedback, /Note: use "help me fix"/i);
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

test('buildHookOutput adds visible systemMessage in gentle mode', () => {
  const output = buildHookOutput('gentle', {
    isEnglish: true,
    isMixed: false,
    severity: 'minor',
    hasMeaningfulIssue: false,
    corrected: 'Could you help me fix this component?',
    issues: [],
    hint: 'Use "help me fix", not "help me to fixing".'
  });

  assert.match(output.systemMessage, /English Coach:/);
  assert.match(output.systemMessage, /Try:/);
  assert.doesNotMatch(JSON.stringify(output), /"decision":"block"/);
});

test('buildHookOutput adds visible systemMessage in coach mode', () => {
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

  assert.match(output.systemMessage, /Suggested version/);
  assert.match(output.systemMessage, /Works correctly/);
  assert.equal(output.decision, undefined);
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
