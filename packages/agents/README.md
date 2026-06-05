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

### Follow-Up Specialist

Re-engages dormant customers — leads who got quoted but didn't book, no-shows,
and past customers due for a rebook nudge. See `src/specialists/follow-up.ts`.

#### Hard constraints

- Never sends 2 follow-ups within 14 days to the same customer.
- No proactive outbound after 22:00 local (defers to next 09:00).
- Respects do-not-contact flag on each customer thread.
- Skips customers whose last inbound contained opt-out language ("no thanks", "stop", "not interested", etc.).
- Never acquires the `telegram-owner` adapter — bus only.

#### Follow-up stages

| Stage | Trigger |
|-------|---------|
| `quoted_no_booking` | Quote sent, no booking — default 7 days |
| `booked_no_show` | Appointment missed — default 2 days |
| `paid_rebook` | Last payment > N days — default 90 days |
| `first_dm_no_reply` | First DM never replied — default 3 days |

#### Tenant config

```json
"followup": {
  "enabled": true,
  "min_days_silent": 7,
  "max_days_silent": 180,
  "approval_required": true,
  "stages": ["quoted_no_booking", "booked_no_show", "paid_rebook"]
}
```

#### Penelope trigger phrases

| Owner says | Penelope routes to |
|---|---|
| "follow up with Jordan" | `followup.draft.requested` → `FollowUpSpecialist.draftFollowUp` |
| "draft a follow-up to the no-show on Tuesday" | same |
| "who needs a nudge" | `followup.dormant.requested` → `findDormantCustomers`, list returned to owner |
| "who's dormant" | same |
| Daily 09:30 MDT cron | `FollowUpScheduler.tick()` → queues candidates for approval |

#### Usage

```ts
import {
  FollowUpSpecialist,
  FollowUpScheduler,
  type FollowUpSpecialistConfig,
} from "@penelope/agents";

const config: FollowUpSpecialistConfig = {
  role: "follow-up",
  tenant_id: "dhr",
  tenants_root: "/app/tenants",
  vertical: "auto-service",
  voice_notes: "lowercase, conversational. we come to you.",
  display_name: "Dobson Headlight Restoration",
  followup: {
    enabled: true,
    min_days_silent: 7,
    max_days_silent: 180,
    approval_required: true,
    stages: ["quoted_no_booking", "booked_no_show", "paid_rebook"],
  },
};

// Daily scan (called from cron at 09:30 MDT)
const scheduler = new FollowUpScheduler(config);
const result = await scheduler.tick();
// result.drafts_queued: string[] of draft_ids queued for approval

// Manual draft for a specific customer
const specialist = new FollowUpSpecialist(config);
const text = await specialist.draftFollowUp(thread, "quoted_no_booking");
// "hey, still thinking about getting those headlights sorted? we come to you."

const draft_id = await specialist.queueForApproval({ ... });
await specialist.approve(draft_id);
await specialist.publish(draft_id);
```

---

## Development

```bash
npm install
npm test          # vitest (all specialists)
npm run build     # tsc → dist/
npm run lint      # tsc --noEmit
```
