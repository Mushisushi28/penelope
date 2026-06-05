import { describe, it, expect } from "vitest";
import { buildQuote, parseJobDescription, PricingConfig, JobInput } from "../src/specialists/quote-builder.js";

const BASE_PRICING: PricingConfig = {
  floor: 99,
  cap: 400,
  currency: "CAD",
  default_base: 60,
  base_by_service: {
    "headlight-restoration": 60,
    "paint-correction": 120,
  },
  condition_multipliers: {
    light: 1.0,
    moderate: 1.2,
    heavy: 1.5,
    extreme: 2.0,
  },
  size_multipliers: {
    car: 1.0,
    suv: 1.1,
    truck: 1.15,
    van: 1.2,
    motorcycle: 0.85,
  },
};

describe("quote-builder formula", () => {
  it("computes a single light car quote at floor", () => {
    const job: JobInput = {
      service_type: "headlight-restoration",
      vehicle_size: "car",
      condition: "light",
      quantity: 1,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 60 * light 1.0 * car 1.0 * qty 1 = 60 → clamped to floor 99
    expect(result.final_price).toBe(99);
    expect(result.formula_trace.clamped).toBe(true);
    expect(result.capped).toBe(false);
  });

  it("computes a pair moderate truck quote correctly", () => {
    const job: JobInput = {
      service_type: "headlight-restoration",
      vehicle_size: "truck",
      condition: "moderate",
      quantity: 2,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 60 * moderate 1.2 * truck 1.15 * pair 1.8 = 149.04 → not clamped
    expect(result.final_price).toBe(149.04);
    expect(result.capped).toBe(false);
  });

  it("clamps to cap for extreme quad van", () => {
    const job: JobInput = {
      service_type: "headlight-restoration",
      vehicle_size: "van",
      condition: "extreme",
      quantity: 4,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 60 * extreme 2.0 * van 1.2 * quad 3.2 = 460.8 → capped at 400
    expect(result.final_price).toBe(400);
    expect(result.capped).toBe(true);
    expect(result.cap_reason).toBeTruthy();
  });

  it("never goes below floor", () => {
    const job: JobInput = {
      service_type: "headlight-restoration",
      vehicle_size: "motorcycle",
      condition: "light",
      quantity: 1,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.final_price).toBeGreaterThanOrEqual(BASE_PRICING.floor);
  });

  it("uses default_base when service not in base_by_service", () => {
    const job: JobInput = {
      service_type: "unknown-service",
      vehicle_size: "car",
      condition: "moderate",
      quantity: 1,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 60 * moderate 1.2 * car 1.0 * 1 = 72 → clamped to floor 99
    expect(result.final_price).toBe(99);
  });

  it("uses service-specific base when configured", () => {
    const job: JobInput = {
      service_type: "paint-correction",
      vehicle_size: "car",
      condition: "moderate",
      quantity: 1,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 120 * moderate 1.2 * car 1.0 * 1 = 144 → within floor/cap
    expect(result.final_price).toBe(144);
  });

  it("generates a quote_id", () => {
    const job: JobInput = {
      service_type: "headlight-restoration",
      vehicle_size: "car",
      condition: "moderate",
      quantity: 2,
    };
    const result = buildQuote(job, BASE_PRICING);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.quote_id).toBeTruthy();
    expect(result.quote_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("defaults missing multipliers to 1.0", () => {
    const sparseConfig: PricingConfig = {
      floor: 50,
      cap: 500,
      currency: "USD",
      default_base: 80,
      base_by_service: {},
      condition_multipliers: {},
      size_multipliers: {},
    };
    const job: JobInput = {
      service_type: "test-service",
      vehicle_size: "suv",
      condition: "heavy",
      quantity: 1,
    };
    const result = buildQuote(job, sparseConfig);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // base 80 * heavy 1.5 * suv 1.1 * 1 = 132 (with defaults)
    expect(result.final_price).toBeGreaterThanOrEqual(sparseConfig.floor);
  });
});

describe("parseJobDescription heuristic", () => {
  it("detects truck from 'silverado'", () => {
    const r = parseJobDescription("2018 silverado pair, heavy oxidation");
    expect(r.vehicle_size).toBe("truck");
    expect(r.condition).toBe("heavy");
    expect(r.quantity).toBe(2);
  });

  it("detects suv from 'explorer'", () => {
    const r = parseJobDescription("2020 Ford Explorer, moderate yellowing");
    expect(r.vehicle_size).toBe("suv");
    expect(r.condition).toBe("moderate");
  });

  it("detects motorcycle", () => {
    const r = parseJobDescription("Harley motorcycle, light haze");
    expect(r.vehicle_size).toBe("motorcycle");
    expect(r.condition).toBe("light");
  });

  it("defaults to car + moderate + 1", () => {
    const r = parseJobDescription("a headlight");
    expect(r.vehicle_size).toBe("car");
    expect(r.condition).toBe("moderate");
    expect(r.quantity).toBe(1);
  });

  it("detects pair quantity", () => {
    const r = parseJobDescription("both headlights on a car, severe");
    expect(r.quantity).toBe(2);
  });
});
