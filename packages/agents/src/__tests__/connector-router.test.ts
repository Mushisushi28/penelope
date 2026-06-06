/**
 * Unit tests for the connector-router specialist.
 * Pure data tests — no MCP spawn, no network calls, no real credentials.
 */

import { describe, it, expect } from "vitest";
import {
  routeConnectorRequest,
  CONNECTOR_TOPICS,
} from "../specialists/connector-router.js";

describe("routeConnectorRequest", () => {
  describe("unknown connector", () => {
    it("returns error for unregistered connector_id", () => {
      const result = routeConnectorRequest(
        { connector_id: "bogus", capability: "foo.bar", args: {}, tenant_id: "t1" },
        [],
        [],
      );
      expect(result.error).toMatch(/No connector registered/);
    });
  });

  describe("unknown capability", () => {
    it("returns error when capability not declared on descriptor", () => {
      const result = routeConnectorRequest(
        {
          connector_id: "stripe",
          capability: "nonexistent.op",
          args: {},
          tenant_id: "t1",
        },
        ["STRIPE_API_KEY"],
        [],
      );
      expect(result.error).toMatch(/does not expose capability/);
    });
  });

  describe("missing env vars", () => {
    it("returns error listing missing env vars when none present", () => {
      const result = routeConnectorRequest(
        { connector_id: "stripe", capability: "payment.list", args: {}, tenant_id: "t1" },
        [],
        [],
      );
      expect(result.error).toMatch(/Missing required env vars/);
      expect(result.required_env_missing).toContain("STRIPE_API_KEY");
    });

    it("passes when all required env vars are present", () => {
      const result = routeConnectorRequest(
        { connector_id: "stripe", capability: "payment.list", args: {}, tenant_id: "t1" },
        ["STRIPE_API_KEY"],
        [],
      );
      expect(result.error).toBeUndefined();
    });
  });

  describe("owner consent gate", () => {
    it("blocks payment.charge without consent token", () => {
      const result = routeConnectorRequest(
        { connector_id: "stripe", capability: "payment.charge", args: {}, tenant_id: "t1" },
        ["STRIPE_API_KEY"],
        [],
      );
      expect(result.consent_required).toBe(true);
      expect(result.result).toBeUndefined();
    });

    it("allows payment.charge when capability is approved", () => {
      const result = routeConnectorRequest(
        { connector_id: "stripe", capability: "payment.charge", args: {}, tenant_id: "t1" },
        ["STRIPE_API_KEY"],
        ["stripe:payment.charge"],
      );
      expect(result.consent_required).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
    });

    it("allows read-only capability without consent", () => {
      const result = routeConnectorRequest(
        { connector_id: "stripe", capability: "payment.list", args: {}, tenant_id: "t1" },
        ["STRIPE_API_KEY"],
        [],
      );
      expect(result.consent_required).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it("blocks email.send on klaviyo without consent", () => {
      const result = routeConnectorRequest(
        { connector_id: "klaviyo", capability: "email.send", args: {}, tenant_id: "t1" },
        ["KLAVIYO_API_KEY"],
        [],
      );
      expect(result.consent_required).toBe(true);
    });

    it("blocks call.create on vapi without consent", () => {
      const result = routeConnectorRequest(
        { connector_id: "vapi", capability: "call.create", args: {}, tenant_id: "t1" },
        ["VAPI_API_KEY"],
        [],
      );
      expect(result.consent_required).toBe(true);
    });
  });

  describe("approved_for_dispatch result", () => {
    it("returns approved_for_dispatch status when all gates pass", () => {
      const result = routeConnectorRequest(
        { connector_id: "hubspot", capability: "contact.list", args: {}, tenant_id: "t1" },
        ["HUBSPOT_ACCESS_TOKEN"],
        [],
      );
      expect(result.result).toEqual(
        expect.objectContaining({ status: "approved_for_dispatch" }),
      );
    });
  });
});

describe("CONNECTOR_TOPICS", () => {
  it("has all expected topic keys", () => {
    expect(CONNECTOR_TOPICS.REQUEST).toBe("connector.invoke.requested");
    expect(CONNECTOR_TOPICS.INVOKED).toBe("connector.invoked");
    expect(CONNECTOR_TOPICS.CONSENT_REQUIRED).toBe("connector.consent.required");
    expect(CONNECTOR_TOPICS.CONSENT_GRANTED).toBe("connector.consent.granted");
    expect(CONNECTOR_TOPICS.ERROR).toBe("connector.error");
  });
});
