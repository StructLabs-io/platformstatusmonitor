# Claude Design Prompt

Use this prompt with Claude Design to generate a more beautiful interface direction for Platform Status Monitor.

```text
You are designing Platform Status Monitor, an open-source, agent-configurable status monitoring dashboard.

Context:
- Product name: Platform Status Monitor.
- Package/repo name: platform-status-monitor.
- It is a Next.js webapp deployed to Cloudflare Pages with a separate Cloudflare Worker API.
- The MVP is JSON-first, with no database if possible.
- Configuration lives in a local bundled JSON file.
- Secrets are not stored in JSON. JSON only references secret names.
- The internal deployment is hosted at psm.structlabs.io.
- The public project should work for other teams and coding agents.

Audience:
- Operators and agency teams who monitor multiple client tech stacks.
- Client delivery managers who need a quick glance of affected platforms.
- Technical users configuring the install through Claude Code, Codex, Cursor, or similar agents.
- Users are busy and need calm operational clarity, not visual noise.

Current app:
- Persistent sidebar navigation.
- Dashboard first screen.
- Top metrics: config validity, recent incidents, recent routing decisions.
- Main dashboard grid: platform status cards grouped by configurable dashboard tiers.
- Each platform card shows platform name, short status/scope, colored status dot, and status page link.
- Healthy is teal/green. Minor/maintenance/info is yellow. Major/critical is red.
- If a platform has an active incident, the card links to the incident source.
- If an incident affects configured dependents/clients, an impact banner appears above the grid.
- Other routes: Incidents, Platforms, Dependents, Routes, Agent Setup.
- Dark mode and light mode both exist.

Important behavior:
- JSON platform order matters.
- Dashboard tiers are configurable in JSON under dashboard.tiers.
- Default should be three tiers.
- The interface must make degraded Worker/config loading states visible. It must not imply all clear if data failed to load.
- The app should remain usable as a read-only MVP.

Design goal:
Create a beautiful, production-grade product dashboard design that feels calm, precise, trustworthy, and distinctive. It should feel more like a polished operational control surface than a generic admin template. Avoid marketing hero layouts, decorative gradients, glassmorphism, excessive glow, and AI-looking dashboard tropes.

Please produce:
1. A visual design direction for the app shell and dashboard.
2. A refined light and dark color system with semantic status colors.
3. Typography recommendations, explicitly not Arial.
4. Dashboard layout recommendations for tiered platform cards.
5. Card design recommendations for healthy, warning, and outage states.
6. Impact banner design recommendations.
7. Loading/degraded/error state recommendations.
8. Responsive behavior for desktop, tablet, and mobile.
9. Accessibility requirements, including color-independent status cues and keyboard focus.
10. Concrete CSS/component guidance that a coding agent can implement in the existing Next.js app.

Constraints:
- Keep cards at 8px radius or less.
- Do not put cards inside cards.
- Do not use gradient text.
- Do not use decorative glassmorphism.
- Do not use oversized hero sections.
- Keep the first screen an actual usable dashboard, not a landing page.
- Prefer familiar product UI patterns over novelty.
- Keep the interface dense enough for repeated use, but not visually cramped.

Current rough structure:
- apps/web/src/app/layout.tsx: app shell.
- apps/web/src/app/page.tsx: dashboard.
- apps/web/src/app/styles.css: global styles and design tokens.
- apps/web/src/lib/dashboard-status.ts: platform health and tier grouping logic.
- config/install.json: bundled install config.

Please be opinionated. Give the design a clear point of view while preserving operational clarity.
```
