# Prompt English Coach

Learn English while you prompt Claude Code.

Prompt English Coach checks English prompts, gives concise teacher-style feedback, and never auto-corrects or replaces what you send to Claude.

## Quick Setup

Recommended mode:

```text
coach
```

After installing or changing the plugin, run:

```text
/reload-plugins
```

## Modes

| Mode | Blocks Claude? | Behavior |
| --- | --- | --- |
| `coach` | No | Recommended. Claude answers first, then you get a corrected version and 1-3 explanations. |
| `gentle` | No | One short hint after Claude answers. |
| `gate` | Yes, for meaningful issues | Blocks unclear prompts and asks you to rewrite them yourself. |
| `strict` | Yes, for meaningful issues | Gate behavior with fuller feedback. |

Gate modes do not block minor style preferences.

## Change Mode

Choose the mode when Claude Code asks for `mode` during install.

To change mode later, reinstall and enter a new value:

```text
/plugin uninstall prompt-english-coach@prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
/reload-plugins
```

Valid values:

```text
coach
gentle
gate
strict
```

## Fast On/Off

```text
/plugin disable prompt-english-coach@prompt-english-coach
/reload-plugins
```

```text
/plugin enable prompt-english-coach@prompt-english-coach
/reload-plugins
```

## What You See

In `coach` mode, feedback appears after Claude's answer:

```text
Stop says: English Coach

Your prompt:
"I doesnt need explanation."

Suggested version:
"I don't need an explanation."

Focus:
- Use "don't" with "I".
- Add "an" before "explanation".
```

In `gate` or `strict`, meaningful issues block the prompt:

```text
English Coach
Please rewrite this before I continue.

Your prompt:
"Could you check if this hook is working good?"

Suggested version:
"Could you check whether this hook works correctly?"
```

## Technical Notes

- Ignores Russian, non-English, mixed-language, and very short prompts.
- Uses the local `claude` CLI, so no extra API key is required.
- Non-blocking feedback is delayed until the `Stop` hook so it does not affect the prompt Claude answers.
- Long displayed prompts are capped at 240 characters.
- Pending feedback is stored briefly in a user-private file and cleaned up by `Stop`, `StopFailure`, or `SessionEnd`.
