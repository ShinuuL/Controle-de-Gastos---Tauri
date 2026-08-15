import { getDb } from "../db";
import { errorCodeFor } from "./redaction";
import { telemetry } from "./telemetry";

type HealthDb = {
  select: (query: string, values?: unknown[]) => Promise<unknown>;
};
type DbGetter = () => Promise<HealthDb>;

export interface DatabaseHealth {
  state: "healthy" | "unhealthy";
  checks: Array<{
    name: "connection" | "tables" | "integrity";
    state: "pass" | "fail";
  }>;
  timestamp: string;
  durationMs: number;
}

export function createHealthChecker(getDatabase: DbGetter = getDb): {
  check: () => Promise<DatabaseHealth>;
} {
  return {
    async check() {
      const startedAt = performance.now();
      const checks: DatabaseHealth["checks"] = [];
      try {
        const db = await getDatabase();
        await db.select("SELECT 1");
        checks.push({ name: "connection", state: "pass" });
        const tables = await db.select(
          "SELECT name FROM sqlite_master WHERE type = $1 AND name IN ($2, $3)",
          ["table", "categories", "expenses"],
        );
        if (
          !Array.isArray(tables) ||
          !["categories", "expenses"].every((name) =>
            tables.some(
              (row) =>
                typeof row === "object" &&
                row !== null &&
                "name" in row &&
                row.name === name,
            ),
          )
        ) {
          throw new Error("database_check_failed");
        }
        checks.push({ name: "tables", state: "pass" });
        const integrity = await db.select("PRAGMA quick_check");
        if (
          !Array.isArray(integrity) ||
          !integrity.some(
            (row) =>
              typeof row === "object" &&
              row !== null &&
              "quick_check" in row &&
              row.quick_check === "ok",
          )
        ) {
          throw new Error("database_check_failed");
        }
        checks.push({ name: "integrity", state: "pass" });
        telemetry.record({ check: "database", outcome: "success" });
        return {
          state: "healthy",
          checks,
          timestamp: new Date().toISOString(),
          durationMs: performance.now() - startedAt,
        };
      } catch (error) {
        const name =
          checks.length === 0
            ? "connection"
            : checks.length === 1
              ? "tables"
              : "integrity";
        checks.push({ name, state: "fail" });
        telemetry.record({
          check: "database",
          outcome: "failure",
          errorCode: errorCodeFor(error),
        });
        return {
          state: "unhealthy",
          checks,
          timestamp: new Date().toISOString(),
          durationMs: performance.now() - startedAt,
        };
      }
    },
  };
}

export const databaseHealth = createHealthChecker();
