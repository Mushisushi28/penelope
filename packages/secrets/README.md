# @penelope/secrets

Per-tenant OS keychain vault for Penelope. Moves channel secrets from plain
JSON files (`tenants/<id>/.secrets/*.json`) to encrypted OS storage.

## Stores

| Backend | Platform | Encryption |
|---|---|---|
| `DpapiStore` | Windows | DPAPI (user-scoped) via `cmdkey` + CredRead |
| `KeychainStore` | macOS | macOS Keychain via `security` CLI |
| `LibsecretStore` | Linux | libsecret via `secret-tool` CLI |
| `EncryptedFileStore` | All (fallback) | AES-256-GCM, scrypt KDF, `~/.penelope/secrets/<tenant>.enc` |

`detectStore()` probes in that order and returns the first available store.
It never throws — returns `EncryptedFileStore` if nothing else is available.

## Usage

```ts
import { detectStore, setSecret, getSecret } from '@penelope/secrets';

const store = await detectStore();

await setSecret(store, 'my-tenant', 'telegram.botToken', 'bot123:AAAA');
const token = await getSecret(store, 'my-tenant', 'telegram.botToken');
```

## Encrypted-file store

Password is read from `PENELOPE_VAULT_PASSWORD` env var. If unset and stdin
is a TTY, it prompts interactively. Non-TTY without the env var throws.

```bash
export PENELOPE_VAULT_PASSWORD=my-strong-password
```

## Migrating from v0.1 plain files

```bash
# Preview without touching anything
node packages/secrets/src/migrate-from-plain.ts --dry-run

# Run migration
node packages/secrets/src/migrate-from-plain.ts

# Specify a different workspace root
node packages/secrets/src/migrate-from-plain.ts --cwd /path/to/workspace
```

The migrator:
1. Reads every `tenants/<id>/.secrets/<key>.json`
2. Stores each value in the vault
3. Deletes the plain file after a confirmed write
4. Removes the empty `.secrets` directory
5. Leaves `tenant.json` and all other tenant files untouched

**Safety guarantees:**
- `--dry-run` never writes or deletes anything
- Each file is deleted only AFTER a successful `store.set()` call
- Errors are collected and reported without aborting the rest of the migration
- Exits with code 1 if any errors occurred

## CLI helpers

```ts
import { detectStore, rotateSecret, listSecrets } from '@penelope/secrets';

const store = await detectStore();

// Rotate a secret
const { previousExists } = await rotateSecret(store, 'my-tenant', 'fb.pageToken', 'new-token');

// List all secrets for a tenant
const refs = await listSecrets(store, 'my-tenant');
refs.forEach(r => console.log(r.key));
```
