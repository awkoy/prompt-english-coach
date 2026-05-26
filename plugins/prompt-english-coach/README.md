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
| `gentle` | No | Shows one short hint after Claude finishes answering. |
| `coach` | No | Shows a corrected version and one to three explanations after Claude finishes answering. |
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

## What happens after Enter

1. You write a prompt and press Enter.
2. Claude Code runs the `UserPromptSubmit` hook before the main Claude request.
3. The hook ignores Russian, non-English, and mixed prompts.
4. For English prompts, the hook calls the local `claude` CLI with an internal evaluator prompt.
5. In `gentle` and `coach`, the hook stores feedback and allows your original prompt silently.
6. Claude answers your original prompt.
7. Claude Code fires the `Stop` hook, and the plugin shows the stored feedback as a `systemMessage`.
8. In `gate` and `strict`, meaningful grammar or clarity issues block the prompt immediately and ask you to rewrite it yourself.

This delayed path keeps non-blocking feedback out of the `UserPromptSubmit` stdout path, where hook output can affect the main Claude turn. The plugin does not auto-correct or replace your submitted prompt.

## Configuration

The plugin prompts for one text option when enabled. Current Claude Code `userConfig` supports text fields, not enum/select dropdowns.

- `coach`: corrected version and one to three explanations
- `gentle`: one short hint
- `gate`: block meaningful grammar or clarity issues
- `strict`: gate behavior with fuller feedback

Invalid or empty values fall back to `coach`.

## Requirements

- Claude Code installed and authenticated.
- Node.js 18 or newer.
- The `claude` CLI available on `PATH`.

## Troubleshooting

If feedback does not appear, run `/hooks` in Claude Code and confirm the `UserPromptSubmit` and `Stop` hooks are registered from `prompt-english-coach`.

If the internal Claude evaluator fails, the hook allows the prompt to continue. This prevents the coach from breaking the coding workflow.

If prompts are very large, the plugin only sends the first 6,000 characters to the internal English evaluator. Your original prompt still continues unchanged in non-blocking modes.
