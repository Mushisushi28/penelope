# Security Policy

## Supported Versions

Penelope is pre-alpha. Only the latest `0.x` release on `main` receives security
updates during this phase.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

Please report security issues via [GitHub Security Advisories](https://github.com/Mushisushi28/penelope/security/advisories/new)
rather than opening a public issue. We will acknowledge receipt within 72 hours
and aim to provide a remediation plan within 7 days.

Do not include real customer data, real credentials, or production tenant
configuration in any report. Use anonymized reproductions.

## Threat Model Summary

- **Tenant isolation**: each business runs in its own directory, with its own
  bus, its own SQLite store, and its own secrets. Cross-tenant reads must be
  explicitly authorized in code.
- **Secrets**: tenant secrets live in `tenants/<id>/.secrets/`, never committed,
  default-loaded from OS keychain when available.
- **Audit log**: every customer-facing outbound is appended to an audit log
  with content hashes chained — gaps or edits are detectable.
- **Telemetry**: opt-in only. When enabled, only aggregate counts leave the
  machine; never customer content, names, phones, or emails.
- **Telegram authentication**: only chat IDs explicitly listed in the tenant
  config can issue commands. Unknown chat IDs are silently ignored.

If a category above describes the issue you're reporting, please call it out.
