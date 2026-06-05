import { describe, it, expect } from "vitest";
import { renderPersona, TenantConfig } from "../src/render-persona.js";

const BASE_CONFIG: TenantConfig = {
  tenant_id: "test-001",
  business: {
    name: "Test Auto Spa",
    type: "auto detailing",
    services: ["headlight restoration", "paint correction", "ceramic coating"],
    hours: { open: "09:00", close: "17:00", timezone: "America/Edmonton" },
    location: { city: "Edmonton", region: "AB", country: "Canada" },
    brief_time: "07:30",
  },
  voice: { tone: "calm-confident", tagline: "Crystal clear results." },
  pricing: {
    floor: 99,
    cap: 350,
    currency: "CAD",
    default_base: 55,
    base_by_service: {},
    condition_multipliers: {},
    size_multipliers: {},
  },
  booking: {
    calendar_provider: "stub",
    default_duration_minutes: 60,
    approval_required: true,
  },
  quiet_hours: { start: "22:00", end: "08:00" },
  channels: ["facebook", "sms"],
  qualifying_questions: [
    "What type of vehicle do you have?",
    "How many headlights need restoration?",
    "How would you describe the current condition (light haze, moderate yellowing, or heavy oxidation)?",
  ],
  approval_required: ["quote", "booking"],
  tenant_brief: "you have 2 pending approvals",
};

describe("renderPersona template engine", () => {
  it("substitutes business.name", () => {
    const result = renderPersona("Hello {{ business.name }}!", BASE_CONFIG);
    expect(result).toContain("Test Auto Spa");
    expect(result).not.toContain("{{");
  });

  it("substitutes business.services as joined list", () => {
    const result = renderPersona("Services: {{ business.services | join(', ') }}", BASE_CONFIG);
    expect(result).toContain("headlight restoration");
    expect(result).toContain("paint correction");
    expect(result).toContain("ceramic coating");
  });

  it("substitutes pricing.floor and pricing.cap", () => {
    const result = renderPersona(
      "Floor: {{ pricing.floor }} {{ pricing.currency }}. Cap: {{ pricing.cap }} {{ pricing.currency }}.",
      BASE_CONFIG
    );
    expect(result).toContain("Floor: 99 CAD");
    expect(result).toContain("Cap: 350 CAD");
  });

  it("renders calm-confident tone branch", () => {
    const template = `{% if voice.tone == "calm-confident" %}CALM{% elif voice.tone == "warm-conversational" %}WARM{% else %}OTHER{% endif %}`;
    const result = renderPersona(template, BASE_CONFIG);
    expect(result).toBe("CALM");
  });

  it("renders warm-conversational tone branch", () => {
    const warmConfig: TenantConfig = { ...BASE_CONFIG, voice: { tone: "warm-conversational" } };
    const template = `{% if voice.tone == "calm-confident" %}CALM{% elif voice.tone == "warm-conversational" %}WARM{% else %}OTHER{% endif %}`;
    const result = renderPersona(template, warmConfig);
    expect(result).toBe("WARM");
  });

  it("renders professional-direct tone branch", () => {
    const pdConfig: TenantConfig = { ...BASE_CONFIG, voice: { tone: "professional-direct" } };
    const template = `{% if voice.tone == "calm-confident" %}CALM{% elif voice.tone == "warm-conversational" %}WARM{% elif voice.tone == "professional-direct" %}DIRECT{% else %}OTHER{% endif %}`;
    const result = renderPersona(template, pdConfig);
    expect(result).toBe("DIRECT");
  });

  it("renders for loop over qualifying_questions", () => {
    const template = `{% for q in qualifying_questions %}- {{ q }}\n{% endfor %}`;
    const result = renderPersona(template, BASE_CONFIG);
    expect(result).toContain("What type of vehicle");
    expect(result).toContain("How many headlights");
    expect(result).toContain("How would you describe");
  });

  it("renders approval_required list", () => {
    const template = `{{ approval_required | join(', ') }}`;
    const result = renderPersona(template, BASE_CONFIG);
    expect(result).toContain("quote");
    expect(result).toContain("booking");
  });

  it("renders empty approval_required gracefully", () => {
    const noApproval: TenantConfig = { ...BASE_CONFIG, approval_required: [] };
    const template = `{% if approval_required | length > 0 %}NEEDS APPROVAL{% else %}FULLY AUTOPILOT{% endif %}`;
    const result = renderPersona(template, noApproval);
    expect(result).toBe("FULLY AUTOPILOT");
  });

  it("renders quiet_hours", () => {
    const template = `Quiet: {{ quiet_hours.start }} – {{ quiet_hours.end }}`;
    const result = renderPersona(template, BASE_CONFIG);
    expect(result).toBe("Quiet: 22:00 – 08:00");
  });

  it("renders channels list", () => {
    const template = `{{ channels | join(', ') }}`;
    const result = renderPersona(template, BASE_CONFIG);
    expect(result).toBe("facebook, sms");
  });

  it("handles extra context variables", () => {
    const result = renderPersona("Hello {{ owner_name }}!", BASE_CONFIG, { owner_name: "Isaac" });
    expect(result).toBe("Hello Isaac!");
  });

  it("renders a config with missing optional fields (uses zod defaults)", () => {
    const minimalConfig = {
      tenant_id: "min-001",
      business: {
        name: "Minimal Biz",
        type: "cleaning",
        services: ["cleaning"],
      },
      pricing: { floor: 50, cap: 200, currency: "USD" },
    };
    // Should not throw — zod fills defaults
    expect(() => renderPersona("{{ business.name }}", minimalConfig as TenantConfig)).not.toThrow();
  });
});
