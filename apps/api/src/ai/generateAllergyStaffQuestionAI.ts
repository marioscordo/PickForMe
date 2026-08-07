import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { buildProfilePromptLines } from "../profile/profileRules";
import type { UserProfile } from "../types/profile";
import { createTwoStepOpenAIClient, stripJsonFence } from "./twoStepRecommendationAIUtils";
import type { MenuLanguage } from "./twoStepRecommendationSchemas";

// Produktidee Aug 2026 (Mario): wenn der Gatekeeper wegen der Allergene/
// Ausschluesse des Nutzers gar kein sicheres Gericht mehr uebrig laesst
// (NO_SAFE_RECOMMENDATIONS in analyze-menu/route.ts), soll der Nutzer nicht
// im Regen stehen bleiben. Dieser Baustein erzeugt - unabhaengig von der
// konkreten Speisekarte, es liegt an dieser Stelle ja keine auswertbare
// Karte vor - einen fertig aussprechbaren, hoeflichen Satz, mit dem der
// Nutzer das Service-Personal direkt nach einem zu seinem Profil passenden
// Gericht fragen kann. Bewusst dieselbe Sprachwahl-Logik wie bei der
// sommelierPhrase (recommendWineForMainDishAI.ts): der Satz muss in der
// Sprache der Speisekarte formuliert sein (ISO-Code direkt an die KI
// uebergeben, keine Namens-Zuordnungstabelle noetig), nicht in der
// Ausgabesprache des Nutzers, damit ihn das Personal vor Ort versteht. Bei
// "unknown"/fehlender menuLanguage faellt die Wahl auf Englisch zurueck,
// analog zu buildOrderLabelsForMenuLanguage() in analyze-menu/route.ts.

export type AllergyStaffQuestionResult = {
  question: string;
};

export async function generateAllergyStaffQuestionAI({
  profile,
  menuLanguage,
  signal
}: {
  profile: UserProfile;
  menuLanguage?: MenuLanguage;
  signal?: AbortSignal;
}): Promise<AllergyStaffQuestionResult | null> {
  const client = createTwoStepOpenAIClient();
  const languageCode = resolveStaffQuestionLanguageCode(menuLanguage);
  const request: ResponseCreateParamsNonStreaming = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: buildAllergyStaffQuestionPrompt({ profile, languageCode })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = parseAllergyStaffQuestionResponse(response.output_text ?? "");

  if (!isRecord(parsed)) {
    return null;
  }

  const question = stringField(parsed.question);

  return question ? { question } : null;
}

function resolveStaffQuestionLanguageCode(menuLanguage: MenuLanguage | undefined) {
  return menuLanguage && menuLanguage !== "unknown" ? menuLanguage : "en";
}

function buildAllergyStaffQuestionPrompt({
  profile,
  languageCode
}: {
  profile: UserProfile;
  languageCode: string;
}) {
  return [
    "Du bist GustaroAI. Ein Nutzer konnte auf der aktuellen Speisekarte kein Gericht finden, das sicher zu seinem Profil passt (zu wenige Zutatenangaben oder ein echter Konflikt).",
    "Formuliere fuer ihn einen einzigen, hoeflichen, fertig aussprechbaren Satz, mit dem er das Service-Personal direkt nach einem passenden, sicheren Gericht fragen kann.",
    `Sprache: ISO-Sprachcode "${languageCode}" - der Satz muss in dieser Sprache formuliert sein, damit ihn das Personal vor Ort versteht, unabhaengig von der Ausgabesprache des Nutzerprofils.`,
    "",
    ...buildProfilePromptLines(profile),
    "",
    "Verbindliche Regeln:",
    "- Nenne im Satz konkret die aktiven Allergene und Ausschluesse aus dem Nutzerprofil oben (z. B. 'kein Gluten, keine Nuesse'), nicht nur allgemein 'Allergien' oder 'Unvertraeglichkeiten'.",
    "- Es liegt keine auswertbare Speisekarte vor - beziehe Dich nicht auf ein bestimmtes Gericht, eine Kategorie oder einen Preis.",
    "- Keine medizinische Beratung, keine Diagnose, nur eine hoefliche Frage an das Personal.",
    "- Wenn im Nutzerprofil weder aktive Allergene noch aktive Ausschluesse/Unvertraeglichkeiten vorhanden sind, gib question als null zurueck.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "question": "fertig aussprechbarer Satz in der Sprache mit dem oben genannten ISO-Code, oder null"',
    "}"
  ].join("\n");
}

function parseAllergyStaffQuestionResponse(outputText: string) {
  try {
    return JSON.parse(stripJsonFence(outputText || "{}"));
  } catch {
    return null;
  }
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
