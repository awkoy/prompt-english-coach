# Prompt English Coach Goal

## Product Goal

Prompt English Coach is a Claude Code plugin that turns English prompts into deliberate English practice inside the coding workflow.

It should behave like a concise, respectful teacher:

- React only when the user submits a prompt that is primarily English.
- Ignore Russian, non-English, and genuinely mixed-language prompts.
- Never silently rewrite the user's prompt before Claude sees it.
- Give practical English feedback that helps the user improve.
- In gate modes, stop the turn only when the prompt has meaningful grammar or clarity problems and ask the user to rewrite it.

## Positioning

Prompt English Coach is not an auto-correct layer.

Comparable tools such as `claude-english-buddy` optimize for zero friction: they correct the prompt and send the corrected version onward. That is useful, but it does not force deliberate practice.

Prompt English Coach optimizes for learning:

- The user keeps ownership of the prompt.
- The plugin explains what to improve.
- Gate mode can require the user to rewrite the prompt before continuing.

Short positioning statement:

> Prompt English Coach is a Claude Code plugin that turns your English prompts into tiny language lessons. Unlike auto-correct plugins, it does not silently rewrite your prompt before Claude sees it. It teaches you what to improve, and in gate mode it asks you to rewrite the prompt yourself before continuing.

## Full Plugin Scope

This is the target for the first complete working version:

- Claude Code plugin marketplace repository layout.
- Installable plugin under `plugins/prompt-english-coach`.
- Hook registration for `UserPromptSubmit`.
- Configurable modes: `gentle`, `coach`, `gate`, and `strict`.
- Local test suite for language detection, output shaping, mode behavior, and malformed evaluator responses.
- README with installation, configuration, examples, limitations, and troubleshooting.
- Examples directory with hook input fixtures and expected behaviors.
- Validation commands for JSON manifests and tests.

## Out of Scope

These are intentionally not part of the first full plugin:

- Codex support.
- Browser extension support.
- Long-term mistake statistics.
- Daily reports.
- Prompt rewriting before Claude receives the user prompt.
- Translation of non-English prompts.
- External OpenAI API usage.

## Definition of Done

The plugin is done when:

- A user can add the marketplace and install `prompt-english-coach`.
- Claude Code registers the `UserPromptSubmit` hook.
- English prompts receive feedback according to the selected mode.
- Russian, non-English, and mixed prompts pass through silently.
- `gentle` and `coach` modes never block the user's prompt.
- `gate` and `strict` modes block only meaningful grammar or clarity problems.
- The hook fails open if the internal evaluator cannot run.
- All tests pass locally.
- `claude plugin validate .` passes, or the README documents any local environment reason it cannot be run.

## Source References

- Claude Code hooks reference: https://code.claude.com/docs/en/hooks
- Claude Code plugins reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code plugin marketplace guide: https://code.claude.com/docs/en/plugin-marketplaces
