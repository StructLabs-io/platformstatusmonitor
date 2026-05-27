# Agent-First Configuration

Ask a coding agent to configure an install with a prompt like:

```text
Configure Platform Status Monitor for my install.
Edit bundled JSON config only.
Do not add real secrets.
Use placeholder secret names.
Run pnpm validate:config.
Explain every routing rule you add.
```

Agents should update JSON config, run validation, and summarize the routing
effect of every change.

