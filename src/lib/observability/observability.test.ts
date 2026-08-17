import { describe, expect, it } from "vitest";
import { createHealthChecker } from "./health";
import { sanitizeDiagnostic } from "./redaction";
import {
  createTelemetry,
  createTelemetryForTesting,
  MAX_DURATION_MS,
  MAX_METRIC_COUNT,
  MAX_METRIC_TOTAL,
  traceOperation,
} from "./telemetry";

describe("observability", () => {
  it("rejects unknown, restricted, object, and financial diagnostic values", () => {
    expect(
      sanitizeDiagnostic({
        operation: "expense.create",
        outcome: "success",
        amount: 1,
        context: {},
      }),
    ).toEqual({ operation: "expense.create", outcome: "success" });
  });

  it("retains only the latest 100 sanitized records", () => {
    const telemetry = createTelemetry();
    for (let index = 0; index < 101; index += 1)
      telemetry.record({
        operation: "expense.list",
        outcome: "success",
        status: index,
      });
    expect(telemetry.records()).toHaveLength(100);
  });

  it("aggregates only allowlisted operation durations", () => {
    const telemetry = createTelemetry();

    telemetry.recordDuration("transaction.create", 12);
    telemetry.recordDuration("transaction.create", 8);
    for (let index = 0; index < 101; index += 1) {
      telemetry.recordDuration(`arbitrary.operation.${index}`, index);
    }

    expect(telemetry.metrics()).toEqual({
      "transaction.create": { count: 2, durationMs: 20 },
    });
  });

  it("caps huge and infinite durations while ignoring invalid samples", () => {
    const telemetry = createTelemetry();

    telemetry.recordDuration("transaction.create", Number.MAX_VALUE);
    telemetry.recordDuration("transaction.create", Number.POSITIVE_INFINITY);
    telemetry.recordDuration("transaction.create", Number.NaN);
    telemetry.recordDuration("transaction.create", -1);
    telemetry.recordDuration("transaction.create", Number.NEGATIVE_INFINITY);

    expect(telemetry.metrics()).toEqual({
      "transaction.create": { count: 2, durationMs: MAX_DURATION_MS * 2 },
    });
  });

  it("saturates metric count and aggregate duration at safe bounds", () => {
    const telemetry = createTelemetryForTesting({
      "transaction.create": {
        count: MAX_METRIC_COUNT - 1,
        durationMs: MAX_METRIC_TOTAL - 1,
      },
    });

    telemetry.recordDuration("transaction.create", MAX_DURATION_MS);
    telemetry.recordDuration("transaction.create", MAX_DURATION_MS);

    expect(telemetry.metrics()).toEqual({
      "transaction.create": {
        count: MAX_METRIC_COUNT,
        durationMs: MAX_METRIC_TOTAL,
      },
    });
  });

  it("traces success and failure while rethrowing the original error", async () => {
    const telemetry = createTelemetry();
    await expect(
      traceOperation("expense.list", async () => 1, telemetry),
    ).resolves.toBe(1);
    const error = new Error("sensitive failure");
    await expect(
      traceOperation(
        "expense.list",
        async () => {
          throw error;
        },
        telemetry,
      ),
    ).rejects.toBe(error);
  });

  it("keeps the original operation working when instrumentation fails", async () => {
    const telemetry = {
      record: () => {
        throw new Error("instrumentation failure");
      },
    };
    await expect(
      traceOperation("expense.list", async () => "ok", telemetry),
    ).resolves.toBe("ok");
  });

  it("reports healthy and unhealthy database checks through an injected seam", async () => {
    const healthy = createHealthChecker(async () => ({
      select: async (query) => {
        if (query.includes("sqlite_master")) {
          return [{ name: "categories" }, { name: "expenses" }];
        }
        if (query.includes("quick_check")) return [{ quick_check: "ok" }];
        return [{ ok: 1 }];
      },
    }));
    const unhealthy = createHealthChecker(async () => ({
      select: async () => {
        throw new Error("private error");
      },
    }));
    await expect(healthy.check()).resolves.toMatchObject({ state: "healthy" });
    await expect(unhealthy.check()).resolves.toMatchObject({
      state: "unhealthy",
    });
  });
});
