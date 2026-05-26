'use strict';

const fs = require('node:fs');
const path = require('node:path');

const files = [
  '.claude-plugin/marketplace.json',
  'plugins/prompt-english-coach/.claude-plugin/plugin.json',
  'plugins/prompt-english-coach/hooks/hooks.json',
  'plugins/prompt-english-coach/examples/english-clean.json',
  'plugins/prompt-english-coach/examples/english-issue.json',
  'plugins/prompt-english-coach/examples/russian.json',
  'plugins/prompt-english-coach/examples/mixed.json'
];

for (const file of files) {
  JSON.parse(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
}

console.log('JSON manifests and fixtures are valid');
