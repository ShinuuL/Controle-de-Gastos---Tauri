import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { databaseHealth } from "./lib/observability/health";
import { telemetry } from "./lib/observability/telemetry";

window.addEventListener("error", () => {
  telemetry.record({
    operation: "ui.globalError",
    outcome: "failure",
    errorCode: "unhandled_error",
  });
});
window.addEventListener("unhandledrejection", () => {
  telemetry.record({
    operation: "ui.unhandledRejection",
    outcome: "failure",
    errorCode: "unhandled_rejection",
  });
});

void databaseHealth.check();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
