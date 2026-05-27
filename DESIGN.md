# Platform Status Monitor Design Context

## Design Direction

Platform Status Monitor should feel quiet, precise, and trustworthy. It is a product dashboard for repeated operational use, so density and predictability matter more than dramatic visuals.

## Layout

- Persistent sidebar navigation on desktop.
- Compact top/sidebar navigation on mobile.
- Dashboard starts with concise system health metrics.
- Platform cards are grouped by dashboard tiers from JSON config.
- Cards should support quick scanning: platform name, status indicator, short scope, status-page/source links.

## Color

- Restrained product palette.
- Neutral surfaces carry most of the interface.
- Semantic colors are reserved for status:
  - healthy: teal/green
  - warning: yellow/amber
  - outage: red
- Dark mode and light mode must both be first-class.

## Typography

Use a modern system UI stack rather than Arial. Typography should be readable, compact, and calm. Avoid decorative display fonts in the app shell.

## Components

- Platform card
- Impact banner
- Metric panel
- Status dot
- Tier section
- Data table
- Theme toggle

Each interactive component should have visible focus, hover where useful, and readable labels.

## Accessibility

- Do not rely on color alone for status.
- Keep labels visible.
- Use semantic headings and landmarks where possible.
- Keep keyboard focus visible.
- Maintain WCAG AA contrast for text and UI indicators.

## Open Design Questions

- Should affected platforms move to the top, or should JSON order remain absolute?
- Should tiers collapse when all services are healthy?
- What visual language best balances operational trust with open-source polish?
