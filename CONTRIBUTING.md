# Contributing to Penelope

Penelope is a small-business OS. Every improvement directly helps real owners
run their businesses better. Contributions are welcome — bugs, new channel
adapters, vertical tenant templates, specialist logic, and documentation.

**Quick links:**
- [License (MIT)](LICENSE)
- [Security policy](SECURITY.md)
- [Deploy guide](docs/DEPLOY.md)
- [Issues](https://github.com/Mushisushi28/penelope/issues)
- [Discussions](https://github.com/Mushisushi28/penelope/discussions)

**Code of conduct:** Be direct, be respectful, assume good intent.
Harassment of any kind is grounds for removal.

DCO sign-off is **not** required. By submitting a PR you certify your
contribution is original work you have the right to submit under the MIT
license.

---

## Development setup

Full prerequisites, environment variables, and first-run walkthrough are in
[docs/DEPLOY.md](docs/DEPLOY.md). Quick version:

```bash
git clone https://github.com/Mushisushi28/penelope.git
cd penelope
node --version   # must be 22+; @penelope/memory requires node:sqlite
npm install      # installs all workspaces
npm run build    # compiles all TypeScript packages
npm test --workspaces --if-present   # full test suite
```

Dev watch mode:

```bash
make dev
# or: npm run dev -w packages/cli
```

---

## Adding a specialist

Reference implementations: `packages/agents/src/specialists/follow-up.ts`
and `packages/agents/src/specialists/content.ts`.

**6-step pattern:**

1. **Extend `SpecialistAgent`** from `packages/agents/src/specialists/base.ts`.
   Provide a `SpecialistRole` string for your specialist.

2. **Implement `run()`** — the specialist's main entry point. All logic lives
   here. Specialists MUST NOT acquire `telegram-owner`. Publish results to the
   internal bus; let Penelope relay them to the owner.

3. **Wire to the meta-router** — add your intent to the `Intent` union in
   `packages/agents/src/penelope/meta-router.ts` and map it to a bus topic in
   `INTENT_TOPIC_MAP`.

4. **Add a scheduler if needed** — for time-driven work, follow the pattern in
   `packages/agents/src/specialists/follow-up-scheduler.ts` (setInterval +
   quiet-hours guard + per-customer rate-limit).

5. **Write tests** — place them in `packages/agents/src/__tests__/`. Cover the
   happy path, rate-limit enforcement, and opt-out/do-not-contact paths.

6. **Document** — add an entry in `packages/agents/README.md` describing the
   specialist's role, config keys, and bus topics it publishes and subscribes to.

---

## Adding a channel adapter

The adapter contract is `ChannelAdapter` in
`packages/adapters/src/types.ts`. Every property and method is documented
inline there.

**5-step pattern:**

1. **Implement `ChannelAdapter`** — create `packages/adapters/src/<name>.ts`.
   Required properties: `name`, `channel_id`, `capabilities`. Required
   methods: `start(onInbound)`, `stop()`, `send(out)`, `healthCheck()`.
   Optional: `edit()`, `react()`.

2. **Declare capabilities accurately** — set each flag in `ChannelCapabilities`
   to reflect what the channel actually supports today. Do not set
   `send_attachments: true` for channels where attachment delivery is a stub.

3. **Register in `AdapterRegistry`** — add the import and wiring in
   `packages/adapters/src/registry.ts`. Follow the existing pattern for
   channel-config shape and secrets injection.

4. **Write tests** — place them in `packages/adapters/src/__tests__/`. At
   minimum: verify the adapter implements every required interface method,
   test that `healthCheck()` resolves without throwing, and cover the inbound
   normalisation logic. See `channel-adapter.test.ts` for the compliance
   harness.

5. **Add to the README adapter list** — update the adapter table in
   `packages/adapters/README.md` with channel name, status (shipped / stub /
   roadmap), and any relevant caveats (e.g. review-gated permissions, 24-hour
   reply window).

---

## Adding a connector

Connectors let specialists call external services (CRMs, booking tools, payment
processors, etc.). The resolution cascade — in priority order:

1. **MCP tool** — if a Model Context Protocol server already exposes the
   capability, wire it first. See `packages/connectors/src/connectors/` for
   existing MCP connectors.
2. **API skill** — a typed SDK call using the service's official API client.
3. **Hermes OpenAPI** — use the Hermes OpenAPI executor
   (`packages/hermes/`) for services with a published OpenAPI spec but no
   SDK.
4. **Browser automation** — CSS-selector–driven DOM interaction via the
   browser specialist. Last resort for web-only surfaces.
5. **Computer-use** — pixel-level computer control. Only for surfaces with
   no other path. Must be flagged explicitly in the connector's capabilities.

New connectors go in `packages/connectors/src/connectors/`. Add a
corresponding entry to `docs/CONNECTORS.md`.

---

## Tests

Run the full suite before opening a PR:

```bash
npm test --workspaces --if-present
```

CI requires **Node 22** and a green Docker build. Both are enforced in
`.github/workflows/`. If your change touches a package, add tests in that
package's `src/__tests__/` directory.

---

## Commit style

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Match the style already in `git log`:

```
feat(adapters): add Instagram DM adapter
fix(core): prevent race condition in procedure loader
docs(install): clarify FB webhook setup
chore(ci): pin Node to 22.x
ci(workflows): add docker build gate
```

Scope is the package or area changed: `adapters`, `agents`, `core`, `cli`,
`dashboard`, `hermes`, `ci`, `docs`.

---

## PR process

1. Branch from `main` using the convention: `feat/`, `fix/`, `docs/`,
   `infra/`, `chore/`.
2. Open a PR against `main`. Fill in the description — what changed and why.
3. CI must be green (build + tests + Docker).
4. One approving review required. Maintainers squash-merge by default.
5. For new features or adapters, open an issue first and wait for the
   `accepted` label before writing code.

Small fixes and docs PRs can skip the issue step.

---

## Reporting issues

Use [GitHub Issues](https://github.com/Mushisushi28/penelope/issues).

Label your issue:
- `bug` — something broken
- `enhancement` — new capability or improvement
- `question` — clarification needed

Include: Node version, OS, relevant config (redact secrets), and steps to
reproduce. For security issues, see [SECURITY.md](SECURITY.md) instead.
