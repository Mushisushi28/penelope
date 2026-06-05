# Contributing to Penelope

Thank you for your interest in contributing. Penelope is a small-business OS — every improvement directly helps real owners run their businesses better.

---

## Getting started

### Prerequisites

- Node.js v20+ (`node --version`)
- Git
- A Telegram bot token for testing (see INSTALL.md)

### Clone and install

```bash
git clone https://github.com/Mushisushi28/penelope.git
cd penelope
npm install          # installs all workspaces
```

### Build

```bash
npm run build        # builds all TypeScript packages
```

Or build a single package:

```bash
npm run build -w packages/core
```

### Run tests

```bash
npm test             # runs vitest across all packages
```

Watch mode:

```bash
npm run test:watch -w packages/core
```

### Dev mode (TypeScript watch)

```bash
make dev
# or: npm run dev -w packages/cli
```

---

## Repository layout

```
penelope/
  packages/
    core/          — tenant model, bus, procedures
    agents/        — owner-agent, meta-router, specialists
    adapters/      — channel adapters (FB, Twilio, SMTP) + integrations
    cli/           — penelope CLI binary
    dashboard/     — owner web dashboard (vanilla JS)
  examples/        — example tenant configs and scripts
  docs/            — extended documentation
  tenants/         — gitignored; your local tenant configs live here
  state/           — gitignored; runtime databases
```

---

## Making changes

### Small fixes and docs

Open a PR directly. No issue required.

### New features or adapters

1. Open an issue describing the feature and its use case.
2. Wait for a maintainer to label it `accepted` before writing code.
3. Reference the issue in your PR: `Closes #123`.

### Branching convention

```
fix/short-description
feat/short-description
infra/short-description
docs/short-description
```

### Commit style

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(adapters): add Instagram DM adapter
fix(core): prevent race condition in procedure loader
docs(install): clarify FB webhook setup
chore(ci): pin Node to 20.15.0
```

---

## Code style

- TypeScript strict mode. `tsconfig.json` in each package enforces this.
- No `any`. If you must escape the type system, use `unknown` and narrow it.
- ESM only (`"type": "module"` in all packages).
- No default exports in library code; named exports only.
- Secrets never in logs. Use the redactor utility from `@penelope/core`.
- Every new adapter must implement `ChannelAdapter` from `@penelope/adapters`.
- Every new outbound action must write to the tenant's `audit_log`.

---

## Running a local end-to-end test

1. Copy `.env.example` to `.env` and fill in your test bot token and chat ID.
2. Run `penelope init` to scaffold a test tenant.
3. Run `penelope up` and send `/status` to your bot.
4. Verify the dashboard at `http://localhost:18900`.

---

## Publishing (maintainers only)

The release pipeline is fully automated via GitHub Actions (`.github/workflows/release.yml`). To publish:

1. Update `version` in the root `package.json` and affected `packages/*/package.json`.
2. Tag the commit: `git tag v0.2.0 && git push --tags`.
3. The release workflow builds, tests, publishes to npm, and pushes the Docker image to `ghcr.io/mushisushi28/penelope`.

You need the `NPM_TOKEN` secret set in GitHub repository settings (Settings → Secrets → Actions). The token must have publish access to the `@penelope` npm org scope.

---

## Developer Certificate of Origin

By contributing to Penelope, you certify that your contribution is your original work and you have the right to submit it under the MIT license. We use DCO sign-off:

```bash
git commit -s -m "feat(core): add thing"
```

The `-s` flag adds `Signed-off-by: Your Name <you@example.com>` to the commit message.

---

## Getting help

- Open an issue: https://github.com/Mushisushi28/penelope/issues
- Start a discussion: https://github.com/Mushisushi28/penelope/discussions
