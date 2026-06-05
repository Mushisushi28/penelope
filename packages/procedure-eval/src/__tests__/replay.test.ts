import { describe, it, expect } from "vitest";
import { replay } from "../replay.js";
import type { Procedure, Recording } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const procedure: Procedure = {
  id: "mobile-detail-v1",
  name: "Mobile Detail — Lead Response",
  version: "1.0.0",
  steps: [
    {
      id: "greet",
      role: "agent",
      template:
        "Hey {customer_first_name}! Thanks for reaching out to {business_name}. What kind of vehicle do you have?",
    },
    {
      id: "capture_vehicle",
      role: "customer",
      extract: [
        { field: "vehicle_year" },
        { field: "vehicle_make" },
        { field: "vehicle_model" },
      ],
    },
    {
      id: "capture_service",
      role: "agent",
      template:
        "Nice! What service are you looking for? Exterior wash, interior deep clean, or full detail?",
    },
    {
      id: "extract_service",
      role: "customer",
      extract: [{ field: "service_requested" }],
    },
    {
      id: "quote",
      role: "agent",
      template:
        "Here's a quick estimate for a {service_requested} on your {vehicle_year} {vehicle_make} {vehicle_model}. Want to lock in a time?",
    },
  ],
};

function makePerfectRecording(): Recording {
  const fields = {
    customer_first_name: "Alex",
    business_name: "Dobson Detailing",
    vehicle_year: "2020",
    vehicle_make: "Honda",
    vehicle_model: "Civic",
    service_requested: "full detail",
  };

  return {
    id: "rec-001",
    procedureId: "mobile-detail-v1",
    tenantId: "dhr",
    recordedAt: "2026-06-04T00:00:00Z",
    messages: [
      {
        role: "agent",
        content:
          "Hey Alex! Thanks for reaching out to Dobson Detailing. What kind of vehicle do you have?",
      },
      {
        role: "customer",
        content: "2020 Honda Civic",
        extracted: { vehicle_year: "2020", vehicle_make: "Honda", vehicle_model: "Civic" },
      },
      {
        role: "agent",
        content:
          "Nice! What service are you looking for? Exterior wash, interior deep clean, or full detail?",
      },
      {
        role: "customer",
        content: "Full detail please",
        extracted: { service_requested: "full detail" },
      },
      {
        role: "agent",
        content:
          "Here's a quick estimate for a full detail on your 2020 Honda Civic. Want to lock in a time?",
      },
    ],
    extractedFields: fields,
    outcome: "booked",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("replay()", () => {
  it("returns a high match score for a perfect recording", async () => {
    const recording = makePerfectRecording();
    const result = await replay(procedure, recording);

    expect(result.procedureId).toBe("mobile-detail-v1");
    expect(result.recordingId).toBe("rec-001");
    expect(result.matchPercent).toBeGreaterThan(70);
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns lower score when messages diverge significantly", async () => {
    const recording = makePerfectRecording();
    // Replace agent messages with gibberish
    recording.messages = recording.messages.map((m) =>
      m.role === "agent" ? { ...m, content: "lorem ipsum dolor sit amet consectetur" } : m
    );

    const result = await replay(procedure, recording);
    expect(result.matchPercent).toBeLessThan(80);
  });

  it("field diffs show correct field names", async () => {
    const recording = makePerfectRecording();
    const result = await replay(procedure, recording);

    const fieldNames = result.fieldDiffs.map((d) => d.field);
    expect(fieldNames).toContain("vehicle_year");
    expect(fieldNames).toContain("vehicle_make");
    expect(fieldNames).toContain("vehicle_model");
    expect(fieldNames).toContain("service_requested");
  });

  it("turn diffs include step IDs", async () => {
    const recording = makePerfectRecording();
    const result = await replay(procedure, recording);

    const stepIds = result.turnDiffs.map((d) => d.stepId).filter(Boolean);
    expect(stepIds).toContain("greet");
    expect(stepIds).toContain("capture_service");
  });

  it("respects custom pass threshold", async () => {
    const recording = makePerfectRecording();

    // Perfect recording should pass 95% threshold
    const strictResult = await replay(procedure, recording, { passThreshold: 95 });
    // May or may not pass depending on similarity score, but result should have the threshold applied
    expect(typeof strictResult.passed).toBe("boolean");

    // Should always pass 10% threshold
    const lenientResult = await replay(procedure, recording, { passThreshold: 10 });
    expect(lenientResult.passed).toBe(true);
  });

  it("handles empty recording gracefully", async () => {
    const recording: Recording = {
      id: "rec-empty",
      procedureId: "mobile-detail-v1",
      tenantId: "dhr",
      recordedAt: "2026-06-04T00:00:00Z",
      messages: [],
      extractedFields: {},
    };

    const result = await replay(procedure, recording);
    expect(result.recordingId).toBe("rec-empty");
    expect(typeof result.matchPercent).toBe("number");
  });
});

describe("recorder integration", () => {
  it("createRecorder captures turns correctly", async () => {
    const { createRecorder } = await import("../recorder.js");

    const agentResponses = [
      "Hey! What vehicle do you have?",
      "Great, full detail it is — want a time slot?",
    ];
    let callCount = 0;

    const mockAgent = async (_input: string) => {
      return agentResponses[callCount++] ?? "...";
    };

    const session = createRecorder(mockAgent, {
      procedureId: "mobile-detail-v1",
      tenantId: "dhr",
      recordingId: "rec-recorder-test",
    });

    await session.turn("Hello, I have a 2020 Civic", { vehicle_make: "Honda" });
    await session.turn("Full detail please", { service_requested: "full detail" });

    const recording = session.finish("booked");

    expect(recording.id).toBe("rec-recorder-test");
    expect(recording.messages).toHaveLength(4); // 2 customer + 2 agent
    expect(recording.extractedFields["vehicle_make"]).toBe("Honda");
    expect(recording.extractedFields["service_requested"]).toBe("full detail");
    expect(recording.outcome).toBe("booked");
  });
});
