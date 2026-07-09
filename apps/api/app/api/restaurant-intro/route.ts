import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRestaurantIntroAI } from "../../../src/ai/generateRestaurantIntroAI";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { loadRestaurantDescriptionFromOrigin } from "../../../src/restaurant/extractRestaurantDescription";

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
    await requireUser(request);

    const body = RestaurantIntroRequestSchema.parse(await request.json());
    const outputLocale = getRestaurantIntroOutputLocale(body);
    const source = await loadRestaurantIntroSource(body);

    if (!source.text.trim()) {
      logRestaurantIntro({
        phase: "fallback",
        sourceKind: source.kind,
        sourceCount: source.sourceUrl ? 1 : 0,
        durationMs: Date.now() - startedAt,
        introGenerated: false,
        fallback: true
      });

      return NextResponse.json({
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
    }

    const introStartedAt = Date.now();
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

    return NextResponse.json({
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

async function loadRestaurantIntroSource(body: z.infer<typeof RestaurantIntroRequestSchema>) {
  const sourceUrl = getSourceUrl(body);

  if (sourceUrl) {
    const description = await loadRestaurantDescriptionFromOrigin(sourceUrl);

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
    return {
      kind: "text" as const,
      sourceUrl: undefined,
      text: manualText.slice(0, 12000)
    };
  }

  if (sourceUrl) {
    try {
      const sourceText = await loadMenuTextFromUrl(sourceUrl);

      if (sourceText.trim().length >= 40) {
        return {
          kind: getSourceKindFromUrl(sourceUrl),
          sourceUrl,
          text: sourceText.slice(0, 12000)
        };
      }
    } catch {
      // The route still returns a controlled limited-source response below.
    }
  }

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
  if (getLanguageCode(outputLocale) === "en") {
    return "I could not read enough reliable restaurant context from the source just now. Open the menu if you want to check the restaurant details directly, or try loading this section again in a moment.";
  }

  return "Ich konnte aus der Quelle gerade keinen belastbaren Restaurantkontext lesen. \u00d6ffne bitte die Speisekarte, wenn Du Details direkt pr\u00fcfen m\u00f6chtest, oder lade diesen Abschnitt gleich noch einmal.";
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
