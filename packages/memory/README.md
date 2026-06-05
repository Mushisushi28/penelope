# @penelope/memory

Multi-scope memory layer for Penelope agents. Uses node:sqlite (built-in, Node >= 22.5) with optional mem0ai backend.

## Three scopes

| Scope   | scope_id | Lifetime    | Use case                             |
|---------|----------|-------------|--------------------------------------|
| user    | psid     | Permanent   | Customer facts, preferences, history |
| session | thread   | TTL-bounded | Current conversation context         |
| agent   | role     | Working mem | Specialist state, reasoning scratch  |

## Usage

  import { Memory } from '@penelope/memory';

  const mem = new Memory({ tenantId: 'acme' });

  mem.remember('user', psid, 'vehicle', '2019 Honda CR-V');
  const facts = mem.recall('user', psid);
  const hits = mem.search('user', psid, 'Honda', 5);
  mem.forget('user', psid, 'vehicle');

## Backends

- SQLite (default): node:sqlite DatabaseSync, one .db file per tenant, zero native addons.
- mem0 (optional): Set MEM0_API_KEY and install mem0ai. Seamlessly replaces the SQLite backend.