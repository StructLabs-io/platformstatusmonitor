# Routing Model

Routing converts a normalized incident into a decision.

MVP decisions:

- `visible`: show in the webapp
- `suppress_irrelevant`: no dependent or route matched
- `suppress_duplicate`: same lifecycle state already processed
- `suppress_quiet_hours`: non-urgent and outside allowed hours

External notification venues (Telegram, Slack) are implemented. They are inactive until a venue is configured in `install.json` and the matching secrets are provisioned.

Routes evaluate:

- platform
- service
- zone
- severity
- lifecycle status
- dependent
- environment
- labels

