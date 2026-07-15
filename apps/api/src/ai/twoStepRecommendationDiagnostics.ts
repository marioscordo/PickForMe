export function isAnalyzeDiagnosticsEnabled() {
  return process.env.GUSTARO_ANALYZE_DIAGNOSTICS === "1";
}
