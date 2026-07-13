import OpenAI from "openai";
import type { Situation, UserProfile } from "../types/profile";
import { buildProfilePromptLines } from "../profile/profileRules";
import type { TwoStepMenuSourceInput } from "./twoStepRecommendationSchemas";

type TwoStepSourceContentPart =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_file";
      file_url: string;
    }
  | {
      type: "input_image";
      image_url: string;
      detail: "high";
    };

export type TwoStepSourceContentDiagnostics = {
  inputMode?: "extracted_text" | "pdf_file_fallback";
  extractedTextCharCount?: number;
  pdfFileInputIncluded: boolean;
  fallbackReason?: string;
};

export function createTwoStepOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  return new OpenAI({ apiKey });
}

export function getTwoStepModelForSource(source: TwoStepMenuSourceInput) {
  if (source.kind === "image") {
    return process.env.OPENAI_IMAGE_MODEL ||
      process.env.OPENAI_PDF_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";
  }

  if (source.kind === "pdf") {
    return process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

export function normalizeTargetLocale(value: string | undefined) {
  const locale = value?.trim();

  return locale ? locale.slice(0, 40) : "de-DE";
}

export function getLanguageNameForLocale(locale: string) {
  const languageCode = locale.toLowerCase().split(/[-_]/)[0];

  switch (languageCode) {
    case "de":
      return "German";
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "nl":
      return "Dutch";
    case "pl":
      return "Polish";
    case "pt":
      return "Portuguese";
    default:
      return locale;
  }
}

export function buildTwoStepProfileContext(profile: UserProfile, situation: Situation) {
  return [
    "Nutzerprofil und Situation sind verbindlicher Kontext:",
    ...buildProfilePromptLines(profile, situation)
  ].join("\n");
}

export function buildTwoStepSourceContent({
  prompt,
  source
}: {
  prompt: string;
  source: TwoStepMenuSourceInput;
}): TwoStepSourceContentPart[] {
  const sourceText = [
    prompt,
    "",
    "Quellenkontext:",
    `sourceKind: ${source.kind}`,
    source.sourceUrl ? `sourceUrl: ${source.sourceUrl}` : "",
    source.sourceLabel ? `sourceLabel: ${source.sourceLabel}` : "",
    source.text ? ["Speisekarten-/Quellentext:", source.text].join("\n") : ""
  ].filter(Boolean).join("\n");

  const content: TwoStepSourceContentPart[] = [
    {
      type: "input_text",
      text: sourceText
    }
  ];

  if (source.kind === "pdf") {
    const shouldIncludePdfFile = source.mainAiInputMode !== "extracted_text";

    if (shouldIncludePdfFile) {
      content.push(
        ...(source.urls ?? []).slice(0, 8).map((url) => ({
          type: "input_file" as const,
          file_url: url
        }))
      );
    }
  }

  if (source.kind === "image") {
    content.push(
      ...(source.urls ?? []).slice(0, 8).map((url) => ({
        type: "input_image" as const,
        image_url: url,
        detail: "high" as const
      }))
    );
  }

  return content;
}

export function getTwoStepSourceContentDiagnostics(
  source: TwoStepMenuSourceInput,
  content: TwoStepSourceContentPart[]
): TwoStepSourceContentDiagnostics {
  const pdfFileInputIncluded = content.some((part) => part.type === "input_file");

  if (source.kind !== "pdf") {
    return {
      pdfFileInputIncluded
    };
  }

  return {
    inputMode: source.mainAiInputMode ?? "pdf_file_fallback",
    extractedTextCharCount: source.extractedTextCharCount ?? 0,
    pdfFileInputIncluded,
    fallbackReason: source.pdfFallbackReason
  };
}

export function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
