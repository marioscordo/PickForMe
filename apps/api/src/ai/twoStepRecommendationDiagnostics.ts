import { createHash } from "node:crypto";

// Privacy-sichere Diagnostik (Technische Gesamtbeschreibung, Abschnitt 6):
// Profilwerte, Menuetexte und Belegausschnitte duerfen unter keinen Umstaenden
// in Produktions-Logs landen, auch nicht durch ein versehentlich gesetztes
// Diagnose-Flag. Deshalb ist NODE_ENV === "production" ein hartes Veto,
// unabhaengig vom Wert der einzelnen Flags.
function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

// Liefert einen stabilen, nicht umkehrbaren Fingerabdruck fuer sensible
// Diagnose-Werte (Profilwerte wie Allergen-/Ausschluss-Label, Menuetext-
// Ausschnitte, Belegtexte). So bleiben Log-Zeilen fuer Debugging
// korrelierbar (gleicher Wert -> gleicher Fingerabdruck), ohne den
// eigentlichen Klartext zu speichern.
export function fingerprintDiagnosticText(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
  return `len${trimmed.length}_${hash}`;
}

export function isAnalyzeDiagnosticsEnabled() {
  return !isProductionEnvironment() && process.env.GUSTARO_ANALYZE_DIAGNOSTICS === "1";
}

export function isAnalyzeOpsDiagnosticsEnabled() {
  return !isProductionEnvironment() && process.env.GUSTARO_ANALYZE_OPS_DIAGNOSTICS === "1";
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
