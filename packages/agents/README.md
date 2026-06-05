# @penelope/agents

Penelope head agent + specialist agents for the Penelope SMB platform.

## Architecture

```
USER ←─── telegram-owner ───→ PENELOPE (head agent)
                                    │
             ┌──────────────────────┼─────────────────────┐
             ▼                      ▼                     ▼
     MarketingSpecialist    BrowserSpecialist       ...more specialists
       (bus only)              (bus only)
```

Specialists **never** contact the owner directly. All results travel back to
Penelope via the loom-a2a internal bus. Penelope decides what (if anything)
the owner sees.

---

## Specialists

### Marketing Specialist

Generates, queues, approves, and publishes social posts via fal.ai + channel
adapters. See `src/specialists/marketing.ts`.

### Browser Specialist

Stagehand-powered no-API site automation. Closes the "no public API" gap —
every SMB pain point that requires driving a website (Yelp reviews, Nextdoor
posts, vendor portals, supplier sites).

#### Usage

```ts
import {
  BrowserSpecialist,
  registerRecipe,
  yelpReviewCountRecipe,
} from "@penelope/agents";

// Register built-in recipes at startup
registerRecipe("yelp-review-count", yelpReviewCountRecipe);

// Instantiate (one per tenant)
const browser = new BrowserSpecialist({
  role: "browser",
  tenant_id: "acme-corp",
  tenants_root: "/app/tenants",
});

// Extract Yelp review stats
const result = await browser.execute({
  goal: "yelp-review-count",
  startUrl: "https://www.yelp.com/biz/acme-corp-cityname",
});

console.log(result.extracted);
// { reviewCount: 142, averageStars: 4.7, businessName: "Acme Corp" }
console.log(result.steps);
// [ { step_n: 1, action: 'navigate', ... }, { step_n: 2, action: 'extract', ... } ]
```

#### Sandbox Isolation

Each tenant gets an isolated Chrome profile. Two tenants running in parallel
never share cookies, sessions, or stored credentials:

```
tenants/
  acme-corp/
    state/
      chrome-profile/    ← Stagehand userDataDir, never shared
  other-tenant/
    state/
      chrome-profile/    ← separate profile
```

#### Safety Guardrails

- **Never on banking sites** — per persona contract.
- **Confirm-needed escalation** — the specialist pauses and returns an
  `EscalationPayload` (not an error) when it detects high-risk actions:
  "Buy Now", "Purchase", "Pay", "Delete", "Submit Order", checkout pages, etc.
  Penelope surfaces the escalation to the owner before anything is committed.
- **Hard step cap** — `maxSteps` (default 25) prevents runaway loops.
- **No telegram-owner adapter** — attempting to acquire it throws at runtime.

#### Built-in Recipes

| Goal string | File | What it does |
|---|---|---|
| `yelp-review-count` | `browser-recipes/yelp-review-count.ts` | Extracts review count + average stars from a Yelp business page |
| `nextdoor-post` | `browser-recipes/nextdoor-post.ts` | Drafts a Nextdoor status update and escalates for owner approval before posting |

#### Adding a Custom Recipe

```ts
import { registerRecipe, type RecipeHandler } from "@penelope/agents";

const myRecipe: RecipeHandler = async (page, startUrl, options, emitStep) => {
  await page.act("click the data export button");
  emitStep({ action: "click", target: "export-btn", result: "clicked" });

  const data = await page.extract("extract the downloaded file name");
  emitStep({ action: "extract", target: "filename", result: String(data) });

  return { filename: data };
};

registerRecipe("export-data", myRecipe);
```

---

## Development

```bash
npm install
npm test          # vitest (all specialists)
npm run build     # tsc → dist/
npm run lint      # tsc --noEmit
```
