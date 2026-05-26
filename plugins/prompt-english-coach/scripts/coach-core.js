'use strict';

const VALID_MODES = new Set(['gentle', 'coach', 'gate', 'strict']);
const VALID_SEVERITIES = new Set(['none', 'minor', 'meaningful']);
const MAX_EVALUATED_PROMPT_CHARS = 6000;

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : 'coach';
}

function classifyPromptLanguage(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return { shouldCheck: false, reason: 'empty' };

  const latinMatches = text.match(/[A-Za-z]/g) || [];
  const cyrillicMatches = text.match(/[\u0400-\u04FF]/g) || [];
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
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractFirstJsonObject(value) {
  const text = stripJsonFence(value);
  const start = text.indexOf('{');
  if (start === -1) return text;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return text;
}

function parseEvaluatorJson(value) {
  const parsed = JSON.parse(extractFirstJsonObject(value));
  const severity = VALID_SEVERITIES.has(parsed.severity) ? parsed.severity : 'none';

  return {
    language: String(parsed.language || ''),
    isEnglish: parsed.isEnglish === true,
    isMixed: parsed.isMixed === true,
    hasMeaningfulIssue: parsed.hasMeaningfulIssue === true || severity === 'meaningful',
    severity,
    corrected: String(parsed.corrected || ''),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    hint: String(parsed.hint || '')
  };
}

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function quoteIfNeeded(value) {
  const text = cleanLine(value);
  if (!text) return '';
  if (text.startsWith('"') && text.endsWith('"')) return text;
  return `"${text}"`;
}

function buildFeedback(modeValue, evaluation) {
  const mode = normalizeMode(modeValue);
  const corrected = cleanLine(evaluation.corrected);
  const hint = cleanLine(evaluation.hint);
  const maxIssues = mode === 'strict' ? 4 : 3;
  const issues = Array.isArray(evaluation.issues) ? evaluation.issues.slice(0, maxIssues) : [];

  if (mode === 'gentle') {
    const lines = ['English Coach:'];
    if (corrected) lines.push(`Try: ${quoteIfNeeded(corrected)}`);
    if (hint) lines.push(`Note: ${hint}`);
    return lines.join('\n');
  }

  const lines = ['English Coach:'];
  if (corrected) {
    lines.push('', 'Suggested version:', quoteIfNeeded(corrected));
  }

  const focus = [];
  for (const issue of issues) {
    const explanation = cleanLine(issue.explanation || issue.suggestion || issue.original);
    if (explanation) focus.push(explanation);
  }
  if (focus.length === 0 && hint) focus.push(hint);

  if (focus.length > 0) {
    lines.push('', 'Focus:');
    for (const item of focus) lines.push(`- ${item}`);
  }

  return lines.join('\n');
}

function hasMeaningfulIssue(evaluation) {
  return evaluation.hasMeaningfulIssue === true || evaluation.severity === 'meaningful';
}

function buildHookOutput(modeValue, evaluation) {
  const mode = normalizeMode(modeValue);

  if (!evaluation || evaluation.isEnglish !== true || evaluation.isMixed === true) {
    return null;
  }

  if ((!evaluation.severity || evaluation.severity === 'none') && !hasMeaningfulIssue(evaluation)) {
    return null;
  }

  const shouldBlock = (mode === 'gate' || mode === 'strict') && hasMeaningfulIssue(evaluation);

  if (shouldBlock) {
    const feedback = buildFeedback(mode, evaluation).replace(
      'English Coach:',
      'English Coach: Please rewrite this before I continue.'
    );

    return {
      decision: 'block',
      reason: feedback,
      suppressOriginalPrompt: true,
      suppressOutput: true
    };
  }

  if (mode === 'gate' || mode === 'strict') {
    return null;
  }

  return {
    systemMessage: buildFeedback(mode, evaluation),
    suppressOutput: true
  };
}

function preparePromptForEvaluation(userPrompt) {
  const text = String(userPrompt || '');
  if (text.length <= MAX_EVALUATED_PROMPT_CHARS) return text;

  return [
    text.slice(0, MAX_EVALUATED_PROMPT_CHARS),
    '',
    `[Prompt truncated for English evaluation at ${MAX_EVALUATED_PROMPT_CHARS} characters.]`
  ].join('\n');
}

function buildEvaluatorPrompt(userPrompt) {
  const promptJson = JSON.stringify(preparePromptForEvaluation(userPrompt));

  return [
    'You are Prompt English Coach, a concise supportive English teacher for developer prompts.',
    'Analyze only the user prompt in the JSON string below.',
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
    `User prompt JSON string: ${promptJson}`
  ].join('\n');
}

module.exports = {
  normalizeMode,
  classifyPromptLanguage,
  parseEvaluatorJson,
  buildEvaluatorPrompt,
  buildFeedback,
  buildHookOutput,
  preparePromptForEvaluation
};
