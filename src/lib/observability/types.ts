export type DiagnosticValue = string | number | boolean;

export interface SafeDiagnostic {
  operation?: string;
  check?: string;
  outcome?: "success" | "failure";
  level?: "info" | "warn" | "error";
  status?: DiagnosticValue;
  errorCode?: string;
}

export interface Telemetry {
  record: (diagnostic: SafeDiagnostic) => void;
  recordDuration: (operation: string, durationMs: number) => void;
  records: () => SafeDiagnostic[];
  metrics: () => Readonly<
    Record<string, { count: number; durationMs: number }>
  >;
}
