export function isAnalyzeDiagnosticsEnabled() {
  return process.env.GUSTARO_ANALYZE_DIAGNOSTICS === "1";
}

export function isAnalyzeOpsDiagnosticsEnabled() {
  return process.env.GUSTARO_ANALYZE_OPS_DIAGNOSTICS === "1";
}

type AnalyzeOpsDiagnosticValue = string | number | boolean | null | undefined;

export function logAnalyzeOpsDiagnostic(fields: Record<string, AnalyzeOpsDiagnosticValue>) {
  if (!isAnalyzeOpsDiagnosticsEnabled()) {
    return;
  }

  const payload: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }

    payload[key] = typeof value === "string" ? sanitizeOpsDiagnosticString(value) : value;
  }

  console.info(`[GUSTARO_ANALYZE_OPS] ${JSON.stringify(payload)}`);
}

function sanitizeOpsDiagnosticString(value: string) {
  return value.replace(/[^\w.,:| -]/g, "_").slice(0, 120);
}
