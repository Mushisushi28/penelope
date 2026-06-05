# Penelope Connector Catalog

**v0.2 — 84 connectors across 22 categories**

Tier legend:
- **T1 MCP** — Model Context Protocol server (stdio or SSE). Richest capabilities, lowest cost.
- **T2 API-skill** — Hand-coded TypeScript wrapper. Tight, opinionated, battle-tested.
- **T3 Hermes** — Auto-generated from OpenAPI spec via `@penelope/hermes`. Instant coverage.
- **T4 Browser** — Browser automation via `open-claude-in-chrome`. Used when no API exists.
- **T5 CU** — Anthropic computer-use beta. Last resort for desktop-only legacy software.

Status: **Full** = live implementation. **Stub** = metadata + routing registered, impl coming.

---

## Payments

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `stripe-mcp` | Stripe (MCP) | T1 MCP (IMPLEMENTED) + T3 Hermes fallback | Full |
| `stripe` | Stripe (legacy stub) | T1 MCP (+ T3 Hermes) | Stub |
| `square` | Square | T2 API-skill | Stub |
| `paypal` | PayPal | T3 Hermes | Stub |
| `shopify-payments` | Shopify Payments | T3 Hermes | Stub |

## Calendar

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `google-calendar` | Google Calendar | T1 MCP (+ T2 API-skill) | Stub |
| `outlook-calendar` | Outlook / Microsoft 365 Calendar | T2 API-skill | Stub |
| `calendly` | Calendly | T3 Hermes | Stub |
| `cal-com` | Cal.com | T3 Hermes | Stub |
| `acuity` | Acuity Scheduling | T4 Browser | Stub |

## Email

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `gmail` | Gmail | T1 MCP (+ T2 API-skill) | Stub |
| `outlook365` | Outlook 365 | T1 MCP | Stub |
| `sendgrid` | SendGrid | T3 Hermes | Stub |
| `mailchimp` | Mailchimp | T3 Hermes | Stub |
| `imap-smtp` | IMAP / SMTP | T2 API-skill | Stub |

## SMS

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `twilio` | Twilio SMS | T2 API-skill (+ T3 Hermes) | Stub |
| `textnow` | TextNow | T4 Browser | Stub |
| `messagebird` | MessageBird / Bird | T3 Hermes | Stub |

## Messaging

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `facebook-page` | Facebook Page Inbox | T2 API-skill | Stub |
| `instagram` | Instagram DM | T2 API-skill | Stub |
| `whatsapp-business` | WhatsApp Business | T2 API-skill | IMPLEMENTED |
| `telegram-bot` | Telegram Bot | T2 API-skill | Stub |
| `beeper-matrix` | Beeper / Matrix | T1 MCP | Stub |

## CRM

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `hubspot` | HubSpot CRM | T3 Hermes | Stub |
| `pipedrive` | Pipedrive | T3 Hermes | Stub |
| `salesforce` | Salesforce | T3 Hermes | Stub |
| `notion-crm` | Notion (CRM) | T1 MCP | Stub |
| `airtable` | Airtable | T3 Hermes | Stub |

## Reviews

| ID | Display Name | Tier | Rationale | Status |
|----|--------------|------|-----------|--------|
| `google-business-profile` | Google Business Profile | T4 Browser | No public API for review-ask flows | Stub |
| `facebook-reviews` | Facebook Reviews | T2 API-skill | Graph API supports recommendations | Stub |
| `yelp` | Yelp | T4 Browser | No review-solicitation API | Stub |
| `trustpilot` | Trustpilot | T3 Hermes | OpenAPI available | Stub |

## POS

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `square` | Square POS | T2 API-skill | Stub |
| `toast` | Toast POS | T3 Hermes | Stub |
| `lightspeed` | Lightspeed | T3 Hermes | Stub |
| `clover` | Clover | T3 Hermes | Stub |

## Accounting

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `quickbooks-online` | QuickBooks Online | T3 Hermes | Stub |
| `wave` | Wave Accounting | T3 Hermes | Stub |
| `xero` | Xero | T3 Hermes | Stub |
| `freshbooks` | FreshBooks | T3 Hermes | Stub |

## Ads

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `facebook-ads` | Facebook Ads | T2 API-skill | Stub |
| `google-ads` | Google Ads | T3 Hermes | Stub |
| `tiktok-ads` | TikTok Ads | T3 Hermes | Stub |

## Social

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `facebook-page-posts` | Facebook Page Posts | T2 API-skill | Stub |
| `instagram-posts` | Instagram Posts | T2 API-skill | Stub |
| `twitter-x` | X (Twitter) | T3 Hermes | Stub |
| `tiktok` | TikTok | T4 Browser | Stub |
| `linkedin` | LinkedIn | T3 Hermes | Stub |
| `youtube` | YouTube | T3 Hermes | Stub |

## Forms

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `typeform` | Typeform | T3 Hermes | Stub |
| `tally` | Tally Forms | T3 Hermes | Stub |
| `jotform` | JotForm | T3 Hermes | Stub |
| `google-forms` | Google Forms | T4 Browser | Stub |

## Bookings

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `calendly` | Calendly | T3 Hermes | Stub |
| `acuity` | Acuity Scheduling | T4 Browser | Stub |
| `bookwhen` | Bookwhen | T4 Browser | Stub |
| `book-like-a-boss` | Book Like A Boss | T4 Browser | Stub |

## Inventory

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `shopify` | Shopify | T3 Hermes | Stub |
| `woocommerce` | WooCommerce | T3 Hermes | Stub |
| `bigcommerce` | BigCommerce | T3 Hermes | Stub |

## Shipping

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `shippo` | Shippo | T3 Hermes | Stub |
| `easypost` | EasyPost | T3 Hermes | Stub |
| `shipstation` | ShipStation | T3 Hermes | Stub |

## Maps

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `google-maps` | Google Maps Platform | T3 Hermes | Stub |
| `mapbox` | Mapbox | T3 Hermes | Stub |

## Files

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `google-drive` | Google Drive | T1 MCP | Stub |
| `dropbox` | Dropbox | T3 Hermes | Stub |
| `onedrive` | OneDrive | T1 MCP | Stub |

## E-Sign

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `docusign` | DocuSign | T3 Hermes | Stub |
| `hellosign` | HelloSign (Dropbox Sign) | T3 Hermes | Stub |
| `signrequest` | SignRequest | T4 Browser | Stub |

## Support

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `intercom` | Intercom | T3 Hermes | Stub |
| `zendesk` | Zendesk Support | T3 Hermes | Stub |
| `helpscout` | Help Scout | T3 Hermes | Stub |

## Website

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `webflow` | Webflow | T3 Hermes | Stub |
| `squarespace` | Squarespace | T4 Browser | Stub |
| `wordpress` | WordPress | T3 Hermes | Stub |

## Domains

| ID | Display Name | Tier | Status |
|----|--------------|------|--------|
| `namecheap` | Namecheap | T3 Hermes | Stub |
| `godaddy` | GoDaddy | T3 Hermes | Stub |
| `cloudflare` | Cloudflare | T3 Hermes | Stub |

---

## Adding a Connector

1. Create a class in `packages/connectors/src/` extending the appropriate base (`McpConnector`, `ApiSkillConnector`, `HermesConnector`, `BrowserConnector`, or `ComputerUseConnector`).
2. Add a `stub(...)` call in `seed-connectors.ts` with your metadata.
3. Register upgrade hints in `auto-promote.ts` (`registerOpenApiSpec`, `registerMcpAvailable`, `registerApiSkillAvailable`) so the promote engine can flag it later.
4. Add tests in `src/__tests__/`.
5. Update this catalog.

See `packages/connectors/README.md` for full code examples.
