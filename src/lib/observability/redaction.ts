import type { SafeDiagnostic } from "./types";

const allowedKeys = new Set<keyof SafeDiagnostic>([
  "operation",
  "check",
  "outcome",
  "level",
  "status",
  "errorCode",
]);
const stableIdentifier = /^[a-z][a-zA-Z0-9._-]{0,99}$/;

function isSafeValue(key: keyof SafeDiagnostic, value: unknown): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value === "boolean") return key === "status";
  if (typeof value !== "string") return false;
  if (key === "outcome") return value === "success" || value === "failure";
  if (key === "level")
    return value === "info" || value === "warn" || value === "error";
  return stableIdentifier.test(value);
}

export function sanitizeDiagnostic(
  input: Record<string, unknown>,
): SafeDiagnostic {
  const safe: SafeDiagnostic = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      allowedKeys.has(key as keyof SafeDiagnostic) &&
      isSafeValue(key as keyof SafeDiagnostic, value)
    ) {
      Object.assign(safe, { [key]: value });
    }
  }
  return safe;
}

export function errorCodeFor(_error: unknown): string {
  return "operation_failed";
}
