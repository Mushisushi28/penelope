# @penelope/marketplace

Community connector and procedure template registry for [Penelope](https://github.com/Mushisushi28/penelope).

## What it does

- **Registry**: merges local seed items with a read-only remote index at `penelope-marketplace`.
- **Installer**: downloads, verifies SHA-256, writes to `tenants/<id>/sandbox/`. Requires TOTP to promote to live.
- **Audit log**: append-only NDJSON trail of every install/promote/remove.
- **CLI**: `penelope marketplace list | install <id> | promote <id> | audit`.

## Quick start

```bash
npm install @penelope/marketplace
```

```ts
import { loadRegistry, installFromUrl, promote } from "@penelope/marketplace";

const items = await loadRegistry();
const manifest = items.find(x => x.id === "mobile-detail-v1")!;
await installFromUrl(manifest, { tenantId: "my-shop", tenantsRoot: "./data", sandbox: true });
await promote({ tenantId: "my-shop", tenantsRoot: "./data", manifest, totpCode: "123456" });
```

## CLI

```
penelope marketplace list
penelope marketplace install mobile-detail-v1
PENELOPE_TOTP=123456 penelope marketplace promote mobile-detail-v1
penelope marketplace audit
```

## Seed items

| ID | Kind | Vertical |
|----|------|----------|
| `mobile-detail-v1` | procedure | Automotive detailing |
| `barbershop-booking-v1` | procedure | Barbershop |
| `lead-recovery-v1` | procedure | Cross-vertical re-engagement |

## Submitting to the public registry

The public registry at [penelope-marketplace](https://github.com/Mushisushi28/penelope-marketplace)
is not yet open for submissions. When it launches:

1. Fork `penelope-marketplace`, add manifest + payload YAML.
2. Generate SHA-256 of your payload and set it in the manifest.
3. Open a PR. Maintainers review for safety and vertical fit.
4. Items must be MIT or Apache-2.0 licensed, no hardcoded credentials.

## License

MIT
