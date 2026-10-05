# Security policy

OsmicMails handles mailbox passwords and hostile email content, so security reports get priority.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/CraftedByAli/webmail/security/advisories/new).

Include what you found, how to reproduce it, and the version (Settings → About, or the image tag). You will get an
acknowledgement within 3 working days and a fix or mitigation plan within 14 days for confirmed issues. Credit is given
in the release notes unless you prefer otherwise.

## Supported versions

Security fixes are released for the latest minor version. Run a tagged release image
(`ghcr.io/craftedbyali/osmicmails:<version>`) and update when a new one is published.

## Verifying images

Release images are built by GitHub Actions from this repository and carry signed build provenance:

```bash
gh attestation verify oci://ghcr.io/craftedbyali/osmicmails:<version> --owner CraftedByAli
```

## Hardening

The threat model and the controls in place are described in [docs/SECURITY.md](docs/SECURITY.md); the operator
checklist is on the `/docs/security` page of any OsmicMails instance.
