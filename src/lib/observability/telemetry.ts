import { errorCodeFor, sanitizeDiagnostic } from "./redaction";
import type { SafeDiagnostic, Telemetry } from "./types";

const MAX_RECORDS = 100;
/** Maximum duration retained for one telemetry sample, in milliseconds. */
export const MAX_DURATION_MS = 300_000;
/** Maximum safe number of samples retained for one metric. */
export const MAX_METRIC_COUNT = Number.MAX_SAFE_INTEGER;
/** Maximum safe aggregate duration retained for one metric. */
export const MAX_METRIC_TOTAL = Number.MAX_SAFE_INTEGER;
const METRIC_OPERATIONS = new Set([
  "category.list",
  "category.listBudgetProgress",
  "category.create",
  "category.updateBudget",
  "category.updateColor",
  "category.delete",
  "transaction.listMonth",
  "transaction.create",
  "transaction.update",
  "transaction.delete",
  "transaction.monthlyTotal",
  "transaction.monthlyTotalsByCategory",
  "statementImport.findCandidates",
  "statementImport.confirm",
]);

type Metric = { count: number; durationMs: number };
type Metrics = Record<string, Metric>;

function boundedMetricValue(value: number, maximum: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, maximum);
}

function initialMetrics(metrics: Metrics): Metrics {
  return Object.fromEntries(
    Object.entries(metrics)
      .filter(([operation]) => METRIC_OPERATIONS.has(operation))
      .map(([operation, metric]) => [
        operation,
        {
          count: boundedMetricValue(metric.count, MAX_METRIC_COUNT),
          durationMs: boundedMetricValue(metric.durationMs, MAX_METRIC_TOTAL),
        },
      ]),
  );
}

function createTelemetryWithMetrics(seedMetrics: Metrics = {}): Telemetry {
  const records: SafeDiagnostic[] = [];
  const metrics = initialMetrics(seedMetrics);
  return {
    record(diagnostic) {
      const safe = sanitizeDiagnostic(diagnostic as Record<string, unknown>);
      if (Object.keys(safe).length === 0) return;
      records.push(safe);
      if (records.length > MAX_RECORDS) records.shift();
    },
    recordDuration(operation, durationMs) {
      if (
        !METRIC_OPERATIONS.has(operation) ||
        Number.isNaN(durationMs) ||
        durationMs <= 0
      )
        return;
      const cappedDuration = Math.min(durationMs, MAX_DURATION_MS);
      const current = metrics[operation] ?? { count: 0, durationMs: 0 };
      metrics[operation] = {
        count: Math.min(MAX_METRIC_COUNT, current.count + 1),
        durationMs: Math.min(
          MAX_METRIC_TOTAL,
          current.durationMs + cappedDuration,
        ),
      };
    },
    records: () => [...records],
    metrics: () => ({ ...metrics }),
  };
}

export function createTelemetry(): Telemetry {
  return createTelemetryWithMetrics();
}

export function createTelemetryForTesting(seedMetrics: Metrics): Telemetry {
  return createTelemetryWithMetrics(seedMetrics);
}

export const telemetry = createTelemetry();

export async function traceOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  target: Pick<Telemetry, "record"> &
    Partial<Pick<Telemetry, "recordDuration">> = telemetry,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await fn();
    try {
      target.record({ operation, outcome: "success" });
    } catch {
      /* observability must be isolated */
    }
    return result;
  } catch (error) {
    try {
      target.record({
        operation,
        outcome: "failure",
        errorCode: errorCodeFor(error),
      });
    } catch {
      /* observability must be isolated */
    }
    throw error;
  } finally {
    const durationMs = Math.max(0, performance.now() - startedAt);
    try {
      target.recordDuration?.(operation, durationMs);
    } catch {
      /* observability must be isolated */
    }
  }
}
