# Release Checklist

## Local Verification

```bash
npm run validate
claude plugin validate . --strict
claude plugin validate ./plugins/prompt-english-coach --strict
```

## Versioning

The plugin declares a version in `plugins/prompt-english-coach/.claude-plugin/plugin.json`.

Claude Code only updates versioned plugins when this value changes, so bump it for every user-visible release.

## Publish to GitHub

Authenticate:

```bash
gh auth login -h github.com
```

Create and push:

```bash
gh repo create <github-user>/prompt-english-coach --public --source=. --remote=origin --push
```

Without GitHub CLI:

```bash
git remote add origin git@github.com:<github-user>/prompt-english-coach.git
git push -u origin main
```

## Test Install

In a fresh Claude Code session:

```text
/plugin marketplace add <github-user>/prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
/hooks
```

Expected hooks:

- `UserPromptSubmit`
- `Stop`
- `StopFailure`
- `SessionEnd`

## User Update Path

```text
/plugin marketplace update prompt-english-coach
/plugin update prompt-english-coach@prompt-english-coach
```

Restart Claude Code after updating.

## User Reset Path

```text
/plugin uninstall prompt-english-coach@prompt-english-coach
/plugin marketplace remove prompt-english-coach
/plugin marketplace add <github-user>/prompt-english-coach
/plugin install prompt-english-coach@prompt-english-coach
```
