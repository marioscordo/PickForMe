import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRestaurantIntroAI } from "../../../src/ai/generateRestaurantIntroAI";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import {
  loadRestaurantDescriptionFromOrigin,
  type RestaurantDescriptionDiagnosticEvent
} from "../../../src/restaurant/extractRestaurantDescription";

type RestaurantIntroSourceKind = "official_website" | "pdf" | "html" | "text" | "unknown";
type RestaurantIntroLogValue = string | number | boolean | null | undefined;

const RestaurantIntroRequestSchema = z.object({
  restaurantName: z.string().trim().min(1).max(160).optional(),
  sourceUrl: z.string().trim().min(1).max(2000).optional(),
  menuText: z.string().trim().min(1).max(50000).optional(),
  outputLocale: z.string().trim().min(2).max(40).optional(),
  userLocale: z.string().trim().min(2).max(40).optional()
});

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const authStartedAt = Date.now();
    await requireUser(request);
    logRestaurantIntro({
      phase: "auth",
      durationMs: Date.now() - authStartedAt
    });

    const validationStartedAt = Date.now();
    const body = RestaurantIntroRequestSchema.parse(await request.json());
    const outputLocale = getRestaurantIntroOutputLocale(body);
    logRestaurantIntro({
      phase: "validation",
      durationMs: Date.now() - validationStartedAt,
      hasMenuText: Boolean(body.menuText?.trim()),
      hasRestaurantName: Boolean(body.restaurantName?.trim()),
      hasSourceUrl: Boolean(body.sourceUrl?.trim()),
      outputLocale
    });

    const sourceFetchStartedAt = Date.now();
    const source = await loadRestaurantIntroSource(body, startedAt);
    logRestaurantIntro({
      phase: "source_fetch",
      sourceKind: source.kind,
      sourceCount: source.sourceUrl ? 1 : 0,
      textLength: source.text.length,
      durationMs: Date.now() - sourceFetchStartedAt,
      totalDurationMs: Date.now() - startedAt
    });

    if (!source.text.trim()) {
      const fallbackResponseStartedAt = Date.now();
      const response = NextResponse.json({
        ok: true,
        data: {
          title: getRestaurantIntroTitle(body.userLocale),
          introText: buildLimitedSourceIntro(outputLocale),
          sourceKind: source.kind,
          sourceUrl: source.sourceUrl,
          limitedSource: true,
          fallback: true
        }
      });
      logRestaurantIntro({
        phase: "fallback",
        sourceKind: source.kind,
        sourceCount: source.sourceUrl ? 1 : 0,
        durationMs: Date.now() - startedAt,
        introGenerated: false,
        fallback: true
      });
      logRestaurantIntro({
        phase: "response_serialization",
        sourceKind: source.kind,
        sourceCount: source.sourceUrl ? 1 : 0,
        durationMs: Date.now() - fallbackResponseStartedAt,
        totalDurationMs: Date.now() - startedAt,
        introGenerated: false,
        fallback: true
      });

      return response;
    }

    const introStartedAt = Date.now();
    logRestaurantIntro({
      phase: "ai_start",
      sourceKind: source.kind,
      sourceCount: source.sourceUrl ? 1 : 0,
      sourceTextLength: source.text.length,
      totalDurationMs: Date.now() - startedAt
    });
    const introText = await generateRestaurantIntroAI({
      restaurantName: body.restaurantName,
      sourceText: source.text,
      sourceUrl: source.sourceUrl,
      outputLocale
    });

    logRestaurantIntro({
      phase: "ai",
      sourceKind: source.kind,
      sourceCount: source.sourceUrl ? 1 : 0,
      durationMs: Date.now() - introStartedAt,
      introLength: introText.length,
      totalDurationMs: Date.now() - startedAt,
      introGenerated: true,
      fallback: false
    });

    const responseSerializationStartedAt = Date.now();
    const response = NextResponse.json({
      ok: true,
      data: {
        title: getRestaurantIntroTitle(body.userLocale),
        introText,
        sourceKind: source.kind,
        sourceUrl: source.sourceUrl,
        limitedSource: false,
        fallback: false
      }
    });

    logRestaurantIntro({
      phase: "response_serialization",
      sourceKind: source.kind,
      sourceCount: source.sourceUrl ? 1 : 0,
      durationMs: Date.now() - responseSerializationStartedAt,
      totalDurationMs: Date.now() - startedAt,
      introGenerated: true,
      fallback: false
    });

    logRestaurantIntro({
      phase: "response",
      sourceKind: source.kind,
      sourceCount: source.sourceUrl ? 1 : 0,
      durationMs: Date.now() - startedAt,
      introGenerated: true,
      fallback: false
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError(400, "RESTAURANT_INTRO_INVALID_REQUEST", "Bitte Restaurantquelle angeben.", error.issues)
      );
    }

    logRestaurantIntroError({
      phase: "error",
      durationMs: Date.now() - startedAt,
      error
    });

    if (isRateLimitError(error)) {
      return errorResponse(
        new AppError(
          429,
          "RESTAURANT_INTRO_RATE_LIMIT",
          "Ich konnte den Restauranttext gerade nicht laden. Bitte versuche es gleich noch einmal."
        )
      );
    }

    return errorResponse(
      new AppError(
        503,
        "RESTAURANT_INTRO_UNAVAILABLE",
        "Ich konnte den Restauranttext gerade nicht laden. Bitte versuche es gleich noch einmal."
      )
    );
  }
}

async function loadRestaurantIntroSource(body: z.infer<typeof RestaurantIntroRequestSchema>, requestStartedAt: number) {
  const sourceUrl = getSourceUrl(body);
  const sourceSelectionStartedAt = Date.now();

  logRestaurantIntro({
    phase: "source_selection",
    durationMs: 0,
    hasSourceUrl: Boolean(sourceUrl),
    sourceKind: sourceUrl ? getSourceKindFromUrl(sourceUrl) : "unknown"
  });

  if (sourceUrl) {
    const officialStartedAt = Date.now();
    const description = await loadRestaurantDescriptionFromOrigin(sourceUrl, (event) => {
      logRestaurantIntroDescriptionEvent(event, requestStartedAt);
    });
    logRestaurantIntro({
      phase: "official_source_fetch",
      sourceKind: "official_website",
      sourceCount: sourceUrl ? 1 : 0,
      durationMs: Date.now() - officialStartedAt,
      totalDurationMs: Date.now() - requestStartedAt,
      textLength: description?.text.length ?? 0,
      sourceUrl: description?.sourceUrl ?? sourceUrl
    });

    if (description?.text.trim()) {
      return {
        kind: "official_website" as const,
        sourceUrl: description.sourceUrl,
        text: description.text
      };
    }
  }

  const manualText = body.menuText?.trim() ?? "";

  if (manualText && !looksLikeUrl(manualText) && manualText.length >= 40) {
    logRestaurantIntro({
      phase: "manual_text_selection",
      durationMs: Date.now() - sourceSelectionStartedAt,
      textLength: manualText.length,
      totalDurationMs: Date.now() - requestStartedAt
    });

    return {
      kind: "text" as const,
      sourceUrl: undefined,
      text: manualText.slice(0, 12000)
    };
  }

  if (sourceUrl) {
    try {
      const fallbackStartedAt = Date.now();
      const sourceText = await loadMenuTextFromUrl(sourceUrl);
      logRestaurantIntro({
        phase: "fallback_menu_text_fetch",
        sourceKind: getSourceKindFromUrl(sourceUrl),
        sourceCount: 1,
        durationMs: Date.now() - fallbackStartedAt,
        totalDurationMs: Date.now() - requestStartedAt,
        textLength: sourceText.length
      });

      if (sourceText.trim().length >= 40) {
        return {
          kind: getSourceKindFromUrl(sourceUrl),
          sourceUrl,
          text: sourceText.slice(0, 12000)
        };
      }
    } catch (error) {
      logRestaurantIntroError({
        phase: "fallback_menu_text_fetch_error",
        durationMs: Date.now() - requestStartedAt,
        error
      });
      // The route still returns a controlled limited-source response below.
    }
  }

  logRestaurantIntro({
    phase: "limited_source_selection",
    durationMs: Date.now() - sourceSelectionStartedAt,
    totalDurationMs: Date.now() - requestStartedAt,
    sourceKind: sourceUrl ? getSourceKindFromUrl(sourceUrl) : "unknown"
  });

  return {
    kind: sourceUrl ? getSourceKindFromUrl(sourceUrl) : "unknown" as const,
    sourceUrl,
    text: ""
  };
}

function getSourceUrl(body: z.infer<typeof RestaurantIntroRequestSchema>) {
  const explicitUrl = body.sourceUrl?.trim();

  if (explicitUrl && looksLikeUrl(explicitUrl)) {
    return explicitUrl;
  }

  const menuText = body.menuText?.trim();

  return menuText && looksLikeUrl(menuText) ? menuText : undefined;
}

function getSourceKindFromUrl(value: string): RestaurantIntroSourceKind {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
  } catch {
    return "unknown";
  }
}

function getRestaurantIntroTitle(userLocale: string | undefined) {
  return getLanguageCode(userLocale) === "en" ? "About the restaurant" : "\u00dcber das Restaurant";
}

function getRestaurantIntroOutputLocale(body: z.infer<typeof RestaurantIntroRequestSchema>) {
  return body.outputLocale?.trim() || body.userLocale?.trim() || "de-DE";
}

function buildLimitedSourceIntro(outputLocale: string | undefined) {
  const languageCode = getLanguageCode(outputLocale);
  const fallbackTexts: Record<string, string> = {
    de: "Zu diesem Restaurant liegen nur begrenzte Informationen vor. Die Empfehlung basiert auf den verfuegbaren Angaben.",
    en: "Only limited information is available for this restaurant. The recommendation is based on the available details.",
    es: "Solo hay informacion limitada disponible sobre este restaurante. La recomendacion se basa en los datos disponibles.",
    fr: "Seules des informations limitees sont disponibles sur ce restaurant. La recommandation s'appuie sur les informations disponibles.",
    it: "Sono disponibili solo informazioni limitate su questo ristorante. La raccomandazione si basa sui dati disponibili.",
    nl: "Er is slechts beperkte informatie over dit restaurant beschikbaar. De aanbeveling is gebaseerd op de beschikbare gegevens.",
    pl: "Dostepne sa tylko ograniczone informacje o tej restauracji. Rekomendacja opiera sie na dostepnych danych.",
    pt: "Ha apenas informacoes limitadas disponiveis sobre este restaurante. A recomendacao baseia-se nos dados disponiveis."
  };

  return fallbackTexts[languageCode] ?? fallbackTexts.de;
}

function getLanguageCode(userLocale: string | undefined) {
  return userLocale?.trim().toLowerCase().split(/[-_]/)[0] ?? "de";
}

function logRestaurantIntro(fields: Record<string, RestaurantIntroLogValue>) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_RESTAURANT_INTRO] ${payload}`);
}

function logRestaurantIntroError({
  phase,
  durationMs,
  error
}: {
  phase: string;
  durationMs: number;
  error: unknown;
}) {
  logRestaurantIntro({
    phase,
    durationMs,
    introGenerated: false,
    fallback: false,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
    statusCode: getErrorStatus(error)
  });
}

function logRestaurantIntroDescriptionEvent(event: RestaurantDescriptionDiagnosticEvent, requestStartedAt: number) {
  logRestaurantIntro({
    ...event,
    phase: `source_${event.phase}`,
    totalDurationMs: Date.now() - requestStartedAt
  });
}

function formatLogValue(value: RestaurantIntroLogValue) {
  return typeof value === "string" ? value.replace(/\s+/g, "_") : String(value);
}

function sanitizeLogMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status as RestaurantIntroLogValue
    : undefined;
}

function isRateLimitError(error: unknown) {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : "";

  return status === 429 ||
    message.includes("429") ||
    message.includes("Rate limit") ||
    message.includes("rate limit") ||
    message.includes("TPM");
}
