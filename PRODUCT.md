# Platform Status Monitor Product Context

## Register

product

## Purpose

Platform Status Monitor helps operators, agencies, and client delivery teams see which external SaaS and infrastructure platforms may affect their work. It converts provider status data into a concise operational dashboard, then routes disruption awareness to the right surfaces without overwhelming people.

## Users

- Client operations leads who need a quick answer to "is something down that affects us?"
- Agency and studio operators monitoring multiple client stacks.
- Technical implementers configuring installs with coding agents.
- Internal teams that need visibility before notification channels are added.

## Principles

- Fast glance first. A user should understand platform health in seconds.
- Incident-aware, not alert-noisy. Suppression and routing matter as much as detection.
- JSON-first for the MVP. Configuration should stay readable, reviewable, and agent-editable.
- Secrets never live in config. JSON references secret names only.
- Open source first. The public project should explain the path for private installs.

## Tone

Calm, operational, direct. The app should feel like a trusted control surface, not a marketing site or a decorative status wall.

## Anti-References

- Busy NOC dashboards with flashing panels.
- Generic admin templates with no information hierarchy.
- Marketing-style SaaS pages pretending to be product UI.
- Alert feeds that make every issue feel equally urgent.

## Primary Experience

The dashboard is the first screen. It should show config health, recent incident/decision counts, and grouped platform status cards. If a platform has an active issue, the relevant platform card becomes yellow or red, shows the affected service or zone, and links to the source incident. If clients or dependents are impacted, an impact banner appears above the platform grid.
