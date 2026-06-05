/**
 * @penelope/connectors — v0.2 connector catalog seed
 *
 * Registers metadata stubs for all 80+ connectors across 22 categories.
 * Real implementations ship in separate feature branches; this file
 * establishes the catalog so discovery, marketplace, and tier routing
 * work immediately.
 *
 * Status key:
 *   "full"  — ConnectorDescriptor backed by a live Connector class
 *   "stub"  — metadata only; invoke() not yet implemented
 */

import { register } from "./registry.js";
import { registerOpenApiSpec, registerMcpAvailable, registerApiSkillAvailable } from "./auto-promote.js";
import type { ConnectorDescriptor } from "./types.js";
import { StripeMcpConnector } from "./connectors/stripe-mcp.js";

function stub(d: ConnectorDescriptor): void {
  register(d);
}

export function seedConnectors(): void {
  // ── payments ───────────────────────────────────────────────────────────────
  // Stripe: Tier 1 MCP — real implementation via @stripe/mcp.
  // Tier 3 Hermes fallback also registered via registerOpenApiSpec below.
  register(new StripeMcpConnector());
  registerMcpAvailable("stripe-mcp");
  registerOpenApiSpec("stripe-mcp", "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json");

  // Legacy "stripe" stub retained so existing catalog references don't break.
  stub({
    id: "stripe",
    displayName: "Stripe",
    description: "Full payment processing — charges, subscriptions, invoices, payouts.",
    tier: "mcp",
    category: "payments",
    capabilities: ["charge", "refund", "list-records", "create-record"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("stripe");
  registerOpenApiSpec("stripe", "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json");

  stub({
    id: "square",
    displayName: "Square",
    description: "Square POS payments, customer directory, and catalog.",
    tier: "api-skill",
    category: "payments",
    capabilities: ["charge", "refund", "list-records", "create-record"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("square");

  stub({
    id: "paypal",
    displayName: "PayPal",
    description: "PayPal payments and payouts via OpenAPI spec.",
    tier: "hermes-openapi",
    category: "payments",
    capabilities: ["charge", "refund"],
    implementationStatus: "stub",
  });
  registerOpenApiSpec("paypal", "https://raw.githubusercontent.com/paypal/PayPal-REST-API-openapi/main/openapi/transaction_search_v1.yaml");

  stub({
    id: "shopify-payments",
    displayName: "Shopify Payments",
    description: "Shopify Payments via Admin REST/GraphQL OpenAPI.",
    tier: "hermes-openapi",
    category: "payments",
    capabilities: ["charge", "refund", "list-records"],
    implementationStatus: "stub",
  });

  // ── calendar ───────────────────────────────────────────────────────────────
  stub({
    id: "google-calendar",
    displayName: "Google Calendar",
    description: "Full calendar management — events, attendees, availability.",
    tier: "mcp",
    category: "calendar",
    capabilities: ["schedule-event", "cancel-event", "list-events"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("google-calendar");
  registerApiSkillAvailable("google-calendar");

  stub({
    id: "outlook-calendar",
    displayName: "Outlook / Microsoft 365 Calendar",
    description: "Microsoft Graph API calendar operations.",
    tier: "api-skill",
    category: "calendar",
    capabilities: ["schedule-event", "cancel-event", "list-events"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("outlook-calendar");

  stub({
    id: "calendly",
    displayName: "Calendly",
    description: "Calendly scheduling links, availability, and booked events.",
    tier: "hermes-openapi",
    category: "calendar",
    capabilities: ["schedule-event", "list-events"],
    implementationStatus: "stub",
  });
  registerOpenApiSpec("calendly", "https://developer.calendly.com/api-docs/openapi.yaml");

  stub({
    id: "cal-com",
    displayName: "Cal.com",
    description: "Open-source scheduling — bookings, availability, event types.",
    tier: "hermes-openapi",
    category: "calendar",
    capabilities: ["schedule-event", "cancel-event", "list-events"],
    implementationStatus: "stub",
  });

  stub({
    id: "acuity",
    displayName: "Acuity Scheduling",
    description: "Acuity Scheduling via browser automation (no public API for key flows).",
    tier: "browser",
    category: "calendar",
    capabilities: ["schedule-event", "cancel-event"],
    implementationStatus: "stub",
  });

  // ── email ──────────────────────────────────────────────────────────────────
  stub({
    id: "gmail",
    displayName: "Gmail",
    description: "Send, search, and label Gmail messages.",
    tier: "mcp",
    category: "email",
    capabilities: ["send-email", "list-records", "search"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("gmail");
  registerApiSkillAvailable("gmail");

  stub({
    id: "outlook365",
    displayName: "Outlook 365",
    description: "Microsoft 365 email via MCP server.",
    tier: "mcp",
    category: "email",
    capabilities: ["send-email", "list-records", "search"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("outlook365");

  stub({
    id: "sendgrid",
    displayName: "SendGrid",
    description: "Transactional email and marketing campaigns via OpenAPI.",
    tier: "hermes-openapi",
    category: "email",
    capabilities: ["send-email", "list-records"],
    implementationStatus: "stub",
  });
  registerOpenApiSpec("sendgrid", "https://raw.githubusercontent.com/sendgrid/sendgrid-oai/main/oai.yaml");

  stub({
    id: "mailchimp",
    displayName: "Mailchimp",
    description: "Email marketing lists, campaigns, and automations.",
    tier: "hermes-openapi",
    category: "email",
    capabilities: ["send-email", "list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "imap-smtp",
    displayName: "IMAP / SMTP",
    description: "Generic mailbox access via IMAP read + SMTP send.",
    tier: "api-skill",
    category: "email",
    capabilities: ["send-email", "list-records", "search"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("imap-smtp");

  // ── sms ────────────────────────────────────────────────────────────────────
  stub({
    id: "twilio",
    displayName: "Twilio SMS",
    description: "Twilio SMS send/receive via hand-coded skill.",
    tier: "api-skill",
    category: "sms",
    capabilities: ["send-sms", "receive-message"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("twilio");
  registerOpenApiSpec("twilio", "https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json");

  stub({
    id: "textnow",
    displayName: "TextNow",
    description: "TextNow SMS via browser automation (no public API).",
    tier: "browser",
    category: "sms",
    capabilities: ["send-sms", "receive-message"],
    implementationStatus: "stub",
  });

  stub({
    id: "messagebird",
    displayName: "MessageBird / Bird",
    description: "SMS, voice, and WhatsApp via Bird (MessageBird) OpenAPI.",
    tier: "hermes-openapi",
    category: "sms",
    capabilities: ["send-sms"],
    implementationStatus: "stub",
  });

  // ── messaging ──────────────────────────────────────────────────────────────
  stub({
    id: "facebook-page",
    displayName: "Facebook Page Inbox",
    description: "Facebook Messenger Page inbox — send and receive messages.",
    tier: "api-skill",
    category: "messaging",
    capabilities: ["send-message", "receive-message"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("facebook-page");

  stub({
    id: "instagram",
    displayName: "Instagram DM",
    description: "Instagram Direct Messages via Graph API.",
    tier: "api-skill",
    category: "messaging",
    capabilities: ["send-message", "receive-message"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("instagram");

  stub({
    id: "whatsapp-business",
    displayName: "WhatsApp Business",
    description: "WhatsApp Business Cloud API — text + template + webhook + 24h-window enforcement. Implemented in @penelope/adapters WhatsappBusinessAdapter.",
    tier: "api-skill",
    category: "messaging",
    capabilities: ["send-message", "receive-message", "webhook", "template-message", "reaction"],
    implementationStatus: "full",
  });
  registerApiSkillAvailable("whatsapp-business");

  stub({
    id: "telegram-bot",
    displayName: "Telegram Bot",
    description: "Telegram Bot API — send messages, handle updates.",
    tier: "api-skill",
    category: "messaging",
    capabilities: ["send-message", "receive-message"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("telegram-bot");

  stub({
    id: "beeper-matrix",
    displayName: "Beeper / Matrix",
    description: "Beeper multi-protocol messaging bridge via loom-beeper MCP.",
    tier: "mcp",
    category: "messaging",
    capabilities: ["send-message", "receive-message"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("beeper-matrix");

  // ── crm ────────────────────────────────────────────────────────────────────
  stub({
    id: "hubspot",
    displayName: "HubSpot CRM",
    description: "Contacts, deals, companies, and pipelines via OpenAPI.",
    tier: "hermes-openapi",
    category: "crm",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });
  registerOpenApiSpec("hubspot", "https://api.hubspot.com/api-catalog-public/v1/apis/crm/v3/objects");

  stub({
    id: "pipedrive",
    displayName: "Pipedrive",
    description: "Pipedrive deals, persons, organisations via OpenAPI.",
    tier: "hermes-openapi",
    category: "crm",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });

  stub({
    id: "salesforce",
    displayName: "Salesforce",
    description: "Salesforce objects and flows via OpenAPI / REST.",
    tier: "hermes-openapi",
    category: "crm",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });

  stub({
    id: "notion-crm",
    displayName: "Notion (CRM)",
    description: "Notion databases used as a lightweight CRM via MCP.",
    tier: "mcp",
    category: "crm",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("notion-crm");

  stub({
    id: "airtable",
    displayName: "Airtable",
    description: "Airtable bases and tables via OpenAPI.",
    tier: "hermes-openapi",
    category: "crm",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });

  // ── reviews ────────────────────────────────────────────────────────────────
  stub({
    id: "google-business-profile",
    displayName: "Google Business Profile",
    description: "Review requests and Q&A via browser (no API for review-ask flows).",
    tier: "browser",
    category: "reviews",
    capabilities: ["review-ask"],
    implementationStatus: "stub",
  });

  stub({
    id: "facebook-reviews",
    displayName: "Facebook Reviews",
    description: "Facebook page recommendations via Graph API.",
    tier: "api-skill",
    category: "reviews",
    capabilities: ["review-ask", "list-records"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("facebook-reviews");

  stub({
    id: "yelp",
    displayName: "Yelp",
    description: "Yelp review monitoring and response via browser automation.",
    tier: "browser",
    category: "reviews",
    capabilities: ["review-ask"],
    implementationStatus: "stub",
  });

  stub({
    id: "trustpilot",
    displayName: "Trustpilot",
    description: "Trustpilot review invitations and responses via OpenAPI.",
    tier: "hermes-openapi",
    category: "reviews",
    capabilities: ["review-ask", "list-records"],
    implementationStatus: "stub",
  });

  // ── pos ────────────────────────────────────────────────────────────────────
  stub({
    id: "toast",
    displayName: "Toast POS",
    description: "Toast restaurant POS — orders, menus, payments via OpenAPI.",
    tier: "hermes-openapi",
    category: "pos",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "lightspeed",
    displayName: "Lightspeed",
    description: "Lightspeed retail and restaurant POS via OpenAPI.",
    tier: "hermes-openapi",
    category: "pos",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "clover",
    displayName: "Clover",
    description: "Clover POS — orders, inventory, employees via REST/OpenAPI.",
    tier: "hermes-openapi",
    category: "pos",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  // ── accounting ─────────────────────────────────────────────────────────────
  stub({
    id: "quickbooks-online",
    displayName: "QuickBooks Online",
    description: "QBO invoices, customers, expenses via OpenAPI.",
    tier: "hermes-openapi",
    category: "accounting",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "wave",
    displayName: "Wave Accounting",
    description: "Wave invoices and payments via GraphQL/REST.",
    tier: "hermes-openapi",
    category: "accounting",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "xero",
    displayName: "Xero",
    description: "Xero accounting — invoices, contacts, bank feeds via OpenAPI.",
    tier: "hermes-openapi",
    category: "accounting",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "freshbooks",
    displayName: "FreshBooks",
    description: "FreshBooks invoices, time tracking, and expenses.",
    tier: "hermes-openapi",
    category: "accounting",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  // ── ads ────────────────────────────────────────────────────────────────────
  stub({
    id: "facebook-ads",
    displayName: "Facebook Ads",
    description: "Meta Ads — campaigns, ad sets, creatives, budget management.",
    tier: "api-skill",
    category: "ads",
    capabilities: ["run-ad", "list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("facebook-ads");

  stub({
    id: "google-ads",
    displayName: "Google Ads",
    description: "Google Ads campaigns, keywords, bidding via OpenAPI/REST.",
    tier: "hermes-openapi",
    category: "ads",
    capabilities: ["run-ad", "list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "tiktok-ads",
    displayName: "TikTok Ads",
    description: "TikTok for Business — campaigns and creatives via OpenAPI.",
    tier: "hermes-openapi",
    category: "ads",
    capabilities: ["run-ad", "list-records"],
    implementationStatus: "stub",
  });

  // ── social ─────────────────────────────────────────────────────────────────
  stub({
    id: "facebook-page-posts",
    displayName: "Facebook Page Posts",
    description: "Post content, images, and reels to Facebook Page.",
    tier: "api-skill",
    category: "social",
    capabilities: ["post-content", "list-records"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("facebook-page-posts");

  stub({
    id: "instagram-posts",
    displayName: "Instagram Posts",
    description: "Publish photos, reels, and carousels to Instagram.",
    tier: "api-skill",
    category: "social",
    capabilities: ["post-content", "list-records"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("instagram-posts");

  stub({
    id: "twitter-x",
    displayName: "X (Twitter)",
    description: "Post tweets, threads, and media via X API v2.",
    tier: "hermes-openapi",
    category: "social",
    capabilities: ["post-content"],
    implementationStatus: "stub",
  });

  stub({
    id: "tiktok",
    displayName: "TikTok",
    description: "TikTok content upload via browser automation.",
    tier: "browser",
    category: "social",
    capabilities: ["post-content"],
    implementationStatus: "stub",
  });

  stub({
    id: "linkedin",
    displayName: "LinkedIn",
    description: "LinkedIn posts and company pages via OpenAPI.",
    tier: "hermes-openapi",
    category: "social",
    capabilities: ["post-content"],
    implementationStatus: "stub",
  });

  stub({
    id: "youtube",
    displayName: "YouTube",
    description: "YouTube video uploads, community posts, and analytics.",
    tier: "hermes-openapi",
    category: "social",
    capabilities: ["post-content", "list-records"],
    implementationStatus: "stub",
  });

  // ── forms ──────────────────────────────────────────────────────────────────
  stub({
    id: "typeform",
    displayName: "Typeform",
    description: "Typeform responses and form management via OpenAPI.",
    tier: "hermes-openapi",
    category: "forms",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "tally",
    displayName: "Tally Forms",
    description: "Tally form submissions and webhooks via OpenAPI.",
    tier: "hermes-openapi",
    category: "forms",
    capabilities: ["list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "jotform",
    displayName: "JotForm",
    description: "JotForm submissions and form builder via REST API.",
    tier: "hermes-openapi",
    category: "forms",
    capabilities: ["list-records", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "google-forms",
    displayName: "Google Forms",
    description: "Google Forms responses via browser (limited public API).",
    tier: "browser",
    category: "forms",
    capabilities: ["list-records"],
    implementationStatus: "stub",
  });

  // ── bookings ───────────────────────────────────────────────────────────────
  stub({
    id: "bookwhen",
    displayName: "Bookwhen",
    description: "Bookwhen event bookings via browser automation.",
    tier: "browser",
    category: "bookings",
    capabilities: ["schedule-event", "list-events"],
    implementationStatus: "stub",
  });

  stub({
    id: "book-like-a-boss",
    displayName: "Book Like A Boss",
    description: "BLAB booking pages via browser automation.",
    tier: "browser",
    category: "bookings",
    capabilities: ["schedule-event"],
    implementationStatus: "stub",
  });

  // ── inventory ──────────────────────────────────────────────────────────────
  stub({
    id: "shopify",
    displayName: "Shopify",
    description: "Shopify store — products, orders, inventory via OpenAPI.",
    tier: "hermes-openapi",
    category: "inventory",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "woocommerce",
    displayName: "WooCommerce",
    description: "WooCommerce products and orders via REST API.",
    tier: "hermes-openapi",
    category: "inventory",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "bigcommerce",
    displayName: "BigCommerce",
    description: "BigCommerce storefront and catalog management.",
    tier: "hermes-openapi",
    category: "inventory",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  // ── shipping ───────────────────────────────────────────────────────────────
  stub({
    id: "shippo",
    displayName: "Shippo",
    description: "Multi-carrier shipping labels and tracking via OpenAPI.",
    tier: "hermes-openapi",
    category: "shipping",
    capabilities: ["create-record", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "easypost",
    displayName: "EasyPost",
    description: "EasyPost shipping rates and label generation.",
    tier: "hermes-openapi",
    category: "shipping",
    capabilities: ["create-record", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "shipstation",
    displayName: "ShipStation",
    description: "ShipStation order management and fulfilment.",
    tier: "hermes-openapi",
    category: "shipping",
    capabilities: ["create-record", "list-records", "update-record"],
    implementationStatus: "stub",
  });

  // ── maps ───────────────────────────────────────────────────────────────────
  stub({
    id: "google-maps",
    displayName: "Google Maps Platform",
    description: "Places, Geocoding, Directions, and Business Profile data.",
    tier: "hermes-openapi",
    category: "maps",
    capabilities: ["search", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "mapbox",
    displayName: "Mapbox",
    description: "Mapbox Geocoding, Directions, and Isochrone APIs.",
    tier: "hermes-openapi",
    category: "maps",
    capabilities: ["search"],
    implementationStatus: "stub",
  });

  // ── files ──────────────────────────────────────────────────────────────────
  stub({
    id: "google-drive",
    displayName: "Google Drive",
    description: "Google Drive file management via MCP server.",
    tier: "mcp",
    category: "files",
    capabilities: ["upload-file", "download-file", "list-records", "search"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("google-drive");

  stub({
    id: "dropbox",
    displayName: "Dropbox",
    description: "Dropbox file storage and sharing via OpenAPI.",
    tier: "hermes-openapi",
    category: "files",
    capabilities: ["upload-file", "download-file", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "onedrive",
    displayName: "OneDrive",
    description: "Microsoft OneDrive via Microsoft Graph MCP server.",
    tier: "mcp",
    category: "files",
    capabilities: ["upload-file", "download-file", "list-records"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("onedrive");

  // ── esign ──────────────────────────────────────────────────────────────────
  stub({
    id: "docusign",
    displayName: "DocuSign",
    description: "DocuSign envelopes and e-signatures via OpenAPI.",
    tier: "hermes-openapi",
    category: "esign",
    capabilities: ["sign-document", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "hellosign",
    displayName: "HelloSign (Dropbox Sign)",
    description: "HelloSign signature requests via REST/OpenAPI.",
    tier: "hermes-openapi",
    category: "esign",
    capabilities: ["sign-document", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "signrequest",
    displayName: "SignRequest",
    description: "SignRequest document signing via browser automation.",
    tier: "browser",
    category: "esign",
    capabilities: ["sign-document"],
    implementationStatus: "stub",
  });

  // ── support ────────────────────────────────────────────────────────────────
  stub({
    id: "intercom",
    displayName: "Intercom",
    description: "Intercom conversations, contacts, and automations via OpenAPI.",
    tier: "hermes-openapi",
    category: "support",
    capabilities: ["send-message", "list-records", "create-record"],
    implementationStatus: "stub",
  });
  registerOpenApiSpec("intercom", "https://developers.intercom.com/api-specifications/1.2/openapi.yaml");

  stub({
    id: "zendesk",
    displayName: "Zendesk Support",
    description: "Zendesk tickets, macros, and agents via OpenAPI.",
    tier: "hermes-openapi",
    category: "support",
    capabilities: ["create-record", "update-record", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "helpscout",
    displayName: "Help Scout",
    description: "Help Scout mailboxes and conversations via REST.",
    tier: "hermes-openapi",
    category: "support",
    capabilities: ["create-record", "update-record", "list-records"],
    implementationStatus: "stub",
  });

  // ── website ────────────────────────────────────────────────────────────────
  stub({
    id: "webflow",
    displayName: "Webflow",
    description: "Webflow CMS items and site publishing via OpenAPI.",
    tier: "hermes-openapi",
    category: "website",
    capabilities: ["create-record", "update-record", "list-records"],
    implementationStatus: "stub",
  });

  stub({
    id: "squarespace",
    displayName: "Squarespace",
    description: "Squarespace content management via browser automation.",
    tier: "browser",
    category: "website",
    capabilities: ["post-content"],
    implementationStatus: "stub",
  });

  stub({
    id: "wordpress",
    displayName: "WordPress",
    description: "WordPress posts and pages via WP REST API / OpenAPI.",
    tier: "hermes-openapi",
    category: "website",
    capabilities: ["post-content", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  // ── domains ────────────────────────────────────────────────────────────────
  stub({
    id: "namecheap",
    displayName: "Namecheap",
    description: "Namecheap domain registration and DNS management via API.",
    tier: "hermes-openapi",
    category: "domains",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "godaddy",
    displayName: "GoDaddy",
    description: "GoDaddy domains and DNS via OpenAPI.",
    tier: "hermes-openapi",
    category: "domains",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "cloudflare",
    displayName: "Cloudflare",
    description: "Cloudflare DNS, Workers, and security rules via OpenAPI.",
    tier: "hermes-openapi",
    category: "domains",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  // ── other (automation / productivity) ──────────────────────────────────────
  stub({
    id: "zapier",
    displayName: "Zapier",
    description: "Zapier Zap triggers and webhooks via REST API.",
    tier: "hermes-openapi",
    category: "other",
    capabilities: ["webhook-listen", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "make",
    displayName: "Make (formerly Integromat)",
    description: "Make scenario triggers and data stores via REST API.",
    tier: "hermes-openapi",
    category: "other",
    capabilities: ["webhook-listen", "create-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "slack",
    displayName: "Slack",
    description: "Slack messages and channel management via Web API.",
    tier: "api-skill",
    category: "messaging",
    capabilities: ["send-message", "list-records"],
    implementationStatus: "stub",
  });
  registerApiSkillAvailable("slack");

  stub({
    id: "notion",
    displayName: "Notion",
    description: "Notion pages, databases, and blocks via MCP server.",
    tier: "mcp",
    category: "files",
    capabilities: ["list-records", "create-record", "update-record", "search"],
    implementationStatus: "stub",
  });
  registerMcpAvailable("notion");

  stub({
    id: "asana",
    displayName: "Asana",
    description: "Asana tasks, projects, and workspaces via OpenAPI.",
    tier: "hermes-openapi",
    category: "other",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });

  stub({
    id: "monday",
    displayName: "Monday.com",
    description: "Monday.com boards and items via GraphQL/REST.",
    tier: "hermes-openapi",
    category: "other",
    capabilities: ["list-records", "create-record", "update-record"],
    implementationStatus: "stub",
  });
}
