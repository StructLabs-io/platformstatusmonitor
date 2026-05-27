# Security Policy

Report security issues privately to the maintainers.

Do not open public issues containing tokens, webhook secrets, private URLs, or
customer data.

## Secret Handling

- Real secrets belong in `.dev.vars`, `.env`, or Cloudflare secret storage.
- Public config files use placeholder names only.
- Webhook endpoints should use provider signatures or shared secrets when
  available.

