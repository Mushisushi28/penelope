/**
 * @penelope/billing — Stripe webhook handler
 *
 * Express-compatible handler. Mount at your webhook endpoint, e.g.:
 *   app.post("/billing/webhook", express.raw({ type: "application/json" }), webhookHandler)
 *
 * Handles:
 *   - checkout.session.completed  → activate tenant after first payment
 *   - invoice.paid                → mark subscription active
 *   - customer.subscription.deleted → suspend tenant
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type Stripe from "stripe";

export interface TenantActivateParams {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
}

export interface TenantSuspendParams {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export interface WebhookHandlerCallbacks {
  onActivate: (params: TenantActivateParams) => Promise<void>;
  onInvoicePaid: (params: { tenantId: string; stripeInvoiceId: string }) => Promise<void>;
  onSuspend: (params: TenantSuspendParams) => Promise<void>;
}

export interface WebhookHandlerOptions {
  /** Stripe webhook signing secret from STRIPE_WEBHOOK_SECRET env var */
  webhookSecret?: string;
  callbacks: WebhookHandlerCallbacks;
}

/**
 * Parses and verifies a Stripe webhook event.
 * Returns null if the signature is invalid (caller should return 400).
 */
export async function parseWebhookEvent(
  rawBody: Buffer,
  signature: string,
  secret: string
): Promise<Stripe.Event | null> {
  // Dynamic require keeps stripe optional for self-hosted installs
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require("stripe") as typeof import("stripe").default;
  const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"] ?? "", {
    apiVersion: "2024-06-20",
  });
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

/**
 * Processes a verified Stripe event and dispatches to callbacks.
 */
export async function processWebhookEvent(
  event: Stripe.Event,
  callbacks: WebhookHandlerCallbacks
): Promise<{ handled: boolean; eventType: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.["tenantId"];
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (tenantId && subscriptionId && session.customer) {
        await callbacks.onActivate({
          tenantId,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer.id,
          stripeSubscriptionId: subscriptionId,
          planId: session.metadata?.["planId"] ?? "starter",
        });
      }
      return { handled: true, eventType: event.type };
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = invoice.metadata?.["tenantId"] ?? invoice.subscription_details?.metadata?.["tenantId"];
      if (tenantId) {
        await callbacks.onInvoicePaid({
          tenantId,
          stripeInvoiceId: invoice.id ?? "",
        });
      }
      return { handled: true, eventType: event.type };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.["tenantId"];
      if (tenantId) {
        await callbacks.onSuspend({
          tenantId,
          stripeCustomerId:
            typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripeSubscriptionId: sub.id,
        });
      }
      return { handled: true, eventType: event.type };
    }

    default:
      return { handled: false, eventType: event.type };
  }
}

/**
 * Express-compatible request handler factory.
 *
 * Requires `express.raw({ type: "application/json" })` middleware upstream
 * so req.body is a raw Buffer.
 */
export function createWebhookHandler(options: WebhookHandlerOptions) {
  const secret = options.webhookSecret ?? process.env["STRIPE_WEBHOOK_SECRET"] ?? "";

  return async function webhookHandler(
    req: IncomingMessage & { body: Buffer },
    res: ServerResponse
  ): Promise<void> {
    if (!process.env["STRIPE_SECRET_KEY"]) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Billing not enabled" }));
      return;
    }

    const sig = req.headers?.["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing stripe-signature header" }));
      return;
    }

    const event = await parseWebhookEvent(req.body, sig, secret);
    if (!event) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Webhook signature verification failed" }));
      return;
    }

    try {
      const result = await processWebhookEvent(event, options.callbacks);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true, ...result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  };
}
