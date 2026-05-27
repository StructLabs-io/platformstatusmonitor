# GitHub Actions Setup

The public template repo intentionally does not ship with active GitHub Actions.
This keeps forks quiet by default and avoids running CI before an installer has
reviewed the workflow, permissions, and secret-scanning policy.

The recommended CI workflow lives at:

```text
docs/templates/github-actions/ci.yml
```

## Enable CI

Copy the template into `.github/workflows/ci.yml`:

```bash
mkdir -p .github/workflows
cp docs/templates/github-actions/ci.yml .github/workflows/ci.yml
```

Commit and push the workflow:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enable project checks"
git push
```

In GitHub, confirm Actions are enabled for the repository:

1. Open repository settings.
2. Go to Actions > General.
3. Allow actions and reusable workflows.
4. Save.

## What The Workflow Checks

The template runs:

- dependency install with pnpm
- TypeScript checks
- tests
- config validation
- production build
- secret scanning with Gitleaks in Docker

## Agent Prompt

Use this prompt with a coding agent:

```text
Enable GitHub Actions for this Platform Status Monitor install.
Copy docs/templates/github-actions/ci.yml to .github/workflows/ci.yml.
Do not add secrets.
Run pnpm check, pnpm test, pnpm validate:config, and pnpm build locally first.
Commit only the workflow and any documentation updates required for this install.
```
