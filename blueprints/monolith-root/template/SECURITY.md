# Security Policy

This service is part of the **Ramboll Developer Platform (RDP)** estate. Security
is a first-class, non-negotiable requirement of the golden path.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Report suspected vulnerabilities privately to the Ramboll security team:

- Email: `security@ramboll.com`
- Or use GitHub's **"Report a vulnerability"** (Security tab → Advisories) on this repository.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (a minimal failing input is ideal).
- Affected version / commit.

We aim to acknowledge reports within **2 business days** and to provide a
remediation timeline after triage.

## Supported versions

The `main` branch and the most recent tagged release are supported. Fixes land on
`main` and are back-ported to active release branches as needed.

## Handling secrets

- Never commit secrets, tokens, or credentials. `.env` files are git-ignored.
- Use the platform secret store / CI secrets for all credentials.
- Rotate any credential that is suspected of exposure immediately and report it.

## Dependencies

- Dependencies are pinned via `pyproject.toml`.
- CI runs static checks; keep dependencies current and review advisories.

## Disclosure

We follow coordinated disclosure. Please give us reasonable time to remediate
before any public disclosure.
