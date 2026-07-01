import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUser } from "../../../src/auth/requireUser";
import { askPickForMeAI } from "../../../src/ai/askPickForMeAI";
import { askPickForMePdfUrlAI } from "../../../src/ai/askPickForMePdfUrlAI";
import { askPickForMeImageUrlsAI } from "../../../src/ai/askPickForMeImageUrlsAI";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { parseMenu } from "../../../src/menu/parseMenu";
import {
  extractHtmlMenuFromUrl,
  htmlMenuExtractionToDishes,
  htmlMenuExtractionToMenuText
} from "../../../src/menu/extraction/extractHtmlMenu";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { findLinkedMenuImageUrls, looksLikeImageUrl } from "../../../src/menu/findLinkedMenuImageUrls";
import { loadMenuTextFromMenury, looksLikeMenuryUrl } from "../../../src/menu/loadMenuTextFromMenury";
import { loadRestaurantDescriptionFromOrigin } from "../../../src/restaurant/extractRestaurantDescription";
import { recommendDishes } from "../../../src/recommendation/recommendDishes";
import type { AnalyzeMenuRequest } from "../../../src/types/api";
import type { MenuExtractionResult } from "../../../src/menu/extraction/types";
import type { RestaurantDescriptionResult } from "../../../src/restaurant/extractRestaurantDescription";
import type { Dish } from "../../../src/types/menu";

type FallbackHeroContext = {
  dishes?: Dish[];
  menuType?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  restaurantContextText?: string;
  officialWebsiteText?: string;
};

type LinkedPdfMenu = {
  url: string;
  restaurantContextText?: string;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as AnalyzeMenuRequest;

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "Diese Art von Speisekarte wird in V1 noch nicht unterstützt.");
    }

    if (!body.menuText || body.menuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Bitte zuerst eine Speisekarte einfügen.");
    }

    const rawMenuText = body.menuText.trim();

    if (!looksLikeMenuryUrl(rawMenuText) && looksLikeUrl(rawMenuText) && isKnownDynamicMenuPlatform(rawMenuText)) {
      throw new AppError(
        422,
        "DYNAMIC_MENU_UNSUPPORTED",
        "Diese digitale Menüplattform wird in V1 noch nicht unterstützt. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
      );
    }
    let dynamicMenuText: string | null = null;

    if (looksLikeUrl(rawMenuText) && looksLikeMenuryUrl(rawMenuText)) {
      try {
        dynamicMenuText = await loadMenuTextFromMenury(rawMenuText);
      } catch (menuryError) {
        console.error("PickForMe Menury loader failed.", menuryError);

        throw new AppError(
          422,
          "DYNAMIC_MENU_UNSUPPORTED",
          "Diese digitale Menüplattform konnte noch nicht sicher ausgelesen werden. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
        );
      }
    }

    if (!dynamicMenuText && looksLikeUrl(rawMenuText) && isKnownDynamicMenuPlatform(rawMenuText)) {
      throw new AppError(
        422,
        "DYNAMIC_MENU_UNSUPPORTED",
        "Diese digitale Menüplattform wird in V1 noch nicht unterstützt. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
      );
    }

    const directPdfUrl = !dynamicMenuText && looksLikeUrl(rawMenuText) && looksLikePdfUrl(rawMenuText) ? rawMenuText : null;
    const linkedPdfMenu = !dynamicMenuText && looksLikeUrl(rawMenuText) && !directPdfUrl ? await findLinkedPdfMenu(rawMenuText) : null;
    const pdfMenuUrl = directPdfUrl ?? linkedPdfMenu?.url;
    const officialRestaurantContextText = looksLikeUrl(rawMenuText)
      ? await loadOfficialRestaurantContextFromOrigin(rawMenuText) ?? linkedPdfMenu?.restaurantContextText
      : undefined;
    const officialRestaurantUrl = looksLikeUrl(rawMenuText)
      ? getOfficialRestaurantHomepageUrl(rawMenuText)
      : undefined;
    if (pdfMenuUrl) {
      if (process.env.PICKFORME_AI_ENABLED !== "true") {
        throw new AppError(400, "PDF_AI_DISABLED", "PDF-Speisekarten benötigen in V1 den KI-Modus.");
      }

      try {
        const aiResult = await withTimeout(
          askPdfWithShortRateLimitRetry({
            pdfUrl: pdfMenuUrl,
            profile: body.profile,
            situation: body.situation
          }),
          45000,
          "PDF_AI_TIMEOUT"
        );

        if (aiResult.recommendations.length === 0) {
          throw new AppError(
            422,
            "NO_SAFE_RECOMMENDATIONS",
            "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
          );
        }

        const conciergeHero = await buildConciergeHeroFromOfficialWebsiteText({
          officialWebsiteText: officialRestaurantContextText,
          restaurantUrl: officialRestaurantUrl,
          fallbackHero: buildFallbackConciergeHero({
            dishes: aiResult.dishes,
            restaurantContextText: rawMenuText
          })
        });

        return NextResponse.json({
          ok: true,
          data: {
            mode: "ai_pdf",
            dishes: aiResult.dishes,
            recommendations: aiResult.recommendations,
            conciergeHero
          }
        });
      } catch (pdfAiError) {
        console.error("PickForMe PDF AI failed.", pdfAiError);

        const message = pdfAiError instanceof Error ? pdfAiError.message : "";

        if (
            message.includes("429") ||
            message.includes("Rate limit") ||
            message.includes("rate limit") ||
            message.includes("TPM")
          ) {
            throw new AppError(
              429,
              "AI_RATE_LIMIT",
              "Ich kann die Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
            );
          }

        if (
          message.includes("429") ||
          message.includes("Rate limit") ||
          message.includes("rate limit") ||
          message.includes("TPM")
        ) {
          throw new AppError(
            429,
            "AI_RATE_LIMIT",
            "Ich kann die Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
          );
        }

        if (message.includes("PDF_AI_TIMEOUT") || message.includes("TEXT_AI_TIMEOUT")) {
          throw new AppError(
            422,
            "ANALYSIS_NOT_SAFE",
            "Ich konnte diese Speisekarte nicht sicher auswerten."
          );
        }

        if (
          message.includes("Profilregeln") ||
          message.includes("keine sicher") ||
          message.includes("NO_SAFE")
        ) {
          throw new AppError(
            422,
            "NO_SAFE_RECOMMENDATIONS",
            "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
          );
        }

        throw pdfAiError;
      }
    }

    const directImageUrl = !dynamicMenuText && looksLikeUrl(rawMenuText) && looksLikeImageUrl(rawMenuText) ? rawMenuText : null;

    if (directImageUrl) {
      if (process.env.PICKFORME_AI_ENABLED !== "true") {
        throw new AppError(400, "IMAGE_AI_DISABLED", "Bild-Speisekarten benötigen in V1 den KI-Modus.");
      }

      try {
        const aiResult = await withTimeout(
          askPickForMeImageUrlsAI({
            imageUrls: [directImageUrl],
            profile: body.profile,
            situation: body.situation
          }),
          45000,
          "IMAGE_AI_TIMEOUT"
        );

        if (aiResult.recommendations.length === 0) {
          throw new AppError(
            422,
            "NO_SAFE_RECOMMENDATIONS",
            "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
          );
        }

        const conciergeHero = await buildConciergeHeroFromOfficialWebsiteText({
          officialWebsiteText: officialRestaurantContextText,
          restaurantUrl: officialRestaurantUrl,
          fallbackHero: buildFallbackConciergeHero({
            dishes: aiResult.dishes,
            restaurantContextText: rawMenuText
          })
        });

        return NextResponse.json({
          ok: true,
          data: {
            mode: "ai_image",
            dishes: aiResult.dishes,
            recommendations: aiResult.recommendations,
            conciergeHero
          }
        });
      } catch (imageAiError) {
        console.error("PickForMe Image AI failed.", imageAiError);

        const message = imageAiError instanceof Error ? imageAiError.message : "";

        if (
          message.includes("429") ||
          message.includes("Rate limit") ||
          message.includes("rate limit") ||
          message.includes("TPM")
        ) {
          throw new AppError(
            429,
            "AI_RATE_LIMIT",
            "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
          );
        }

        if (message.includes("IMAGE_AI_TIMEOUT")) {
          throw new AppError(
            422,
            "ANALYSIS_NOT_SAFE",
            "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
          );
        }

        if (isInvalidImageAiError(imageAiError)) {
          throw new AppError(
            422,
            "IMAGE_MENU_NOT_READABLE",
            "Diese Bild-Speisekarte konnte nicht sicher gelesen werden. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein."
          );
        }

        if (
          message.includes("Profilregeln") ||
          message.includes("keine sicher") ||
          message.includes("NO_SAFE")
        ) {
          throw new AppError(
            422,
            "NO_SAFE_RECOMMENDATIONS",
            "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
          );
        }

        throw imageAiError;
      }
    }

    const restaurantDescription = looksLikeUrl(rawMenuText)
      ? await loadRestaurantDescriptionFromOrigin(rawMenuText)
      : null;
    const shouldExtractHtmlMenu = !dynamicMenuText && looksLikeUrl(rawMenuText) && !pdfMenuUrl && !directImageUrl;
    const htmlMenuExtraction = shouldExtractHtmlMenu
      ? await extractHtmlMenuFromUrl(rawMenuText)
      : null;
    const htmlMenuText = htmlMenuExtraction
      ? htmlMenuExtraction.items.length
        ? htmlMenuExtractionToMenuText(htmlMenuExtraction)
        : htmlMenuExtraction.fragments.join("\n")
      : null;
    const htmlMenuDishes = htmlMenuExtraction?.items.length
      ? htmlMenuExtractionToDishes(htmlMenuExtraction)
      : null;

    let effectiveMenuText: string;

    try {
      effectiveMenuText = dynamicMenuText ?? htmlMenuText ?? (looksLikeUrl(rawMenuText)
        ? await loadMenuTextFromUrl(rawMenuText)
        : rawMenuText);
    } catch {
      throw new AppError(422, "MENU_URL_LOAD_FAILED", "Diese Speisekarte konnte nicht geladen werden.");
    }

    if (effectiveMenuText.trim().length < 20 && !htmlMenuExtraction) {
      if (looksLikeUrl(rawMenuText)) {
        throw new AppError(422, "MENU_URL_LOAD_FAILED", "Diese Speisekarte konnte nicht geladen werden.");
      }

      throw new AppError(400, "MENU_TOO_SHORT", "Aus dieser Eingabe konnte kein ausreichender Speisekartentext gelesen werden.");
    }

    if (process.env.PICKFORME_AI_ENABLED === "true") {
      try {
        const aiResult = await withAbortTimeout(
          (signal) => askPickForMeAI({
            menuText: effectiveMenuText,
            profile: body.profile,
            situation: body.situation,
            signal
          }),
          30000,
          "TEXT_AI_TIMEOUT"
        );
        if (aiResult.recommendations.length > 0) {
          const officialWebsiteText = restaurantDescription?.text;
          const conciergeHero = await buildConciergeHeroFromOfficialWebsiteText({
            officialWebsiteText,
            restaurantUrl: officialRestaurantUrl,
            fallbackHero: buildFallbackConciergeHero({
              dishes: aiResult.dishes,
              menuType: aiResult.menuType,
              recommendationMode: aiResult.recommendationMode,
              restaurantContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`
            })
          });

          return NextResponse.json({
            ok: true,
            data: {
              mode: "ai",
              dishes: aiResult.dishes,
              recommendations: aiResult.recommendations,
              conciergeHero,
              recommendationMode: aiResult.recommendationMode,
              menuType: aiResult.menuType,
              ...buildRestaurantDescriptionPayload(restaurantDescription),
              ...buildMenuExtractionPayload(htmlMenuExtraction)
            }
          });
        }

        const partialData = buildPartialAnalysisPayload(restaurantDescription, htmlMenuExtraction, aiResult.dishes);

        if (partialData) {
          return NextResponse.json({
            ok: true,
            data: partialData
          });
        }

        throw new AppError(
          422,
          "NO_SAFE_RECOMMENDATIONS",
          "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
          buildMenuAnalysisDetails(restaurantDescription, htmlMenuExtraction)
        );
      } catch (aiError) {
        const message = aiError instanceof Error ? aiError.message : "";

        if (message.includes("TEXT_AI_TIMEOUT")) {
          console.error("PickForMe AI timed out, falling back to local recommendation.", aiError);
        } else {
          console.error("PickForMe AI failed.", aiError);

          throw aiError;
        }
      }
    }

    const dishes = htmlMenuDishes ?? parseMenu(effectiveMenuText);

    if (dishes.length === 0 && looksLikeUrl(rawMenuText) && process.env.PICKFORME_AI_ENABLED === "true") {
      const imageUrls = await findLinkedMenuImageUrls(rawMenuText);

      if (imageUrls.length > 0) {
        try {
          const aiResult = await withTimeout(
            askPickForMeImageUrlsAI({
              imageUrls,
              profile: body.profile,
              situation: body.situation
            }),
            45000,
            "IMAGE_AI_TIMEOUT"
          );

          if (aiResult.recommendations.length === 0) {
            throw new AppError(
              422,
              "NO_SAFE_RECOMMENDATIONS",
              "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
            );
          }

          const conciergeHero = await buildConciergeHeroFromOfficialWebsiteText({
            officialWebsiteText: officialRestaurantContextText,
            restaurantUrl: officialRestaurantUrl,
            fallbackHero: buildFallbackConciergeHero({
              dishes: aiResult.dishes,
              restaurantContextText: rawMenuText
            })
          });

          return NextResponse.json({
            ok: true,
            data: {
              mode: "ai_image",
              dishes: aiResult.dishes,
              recommendations: aiResult.recommendations,
              conciergeHero
            }
          });
        } catch (imageAiError) {
          console.error("PickForMe linked Image AI failed.", imageAiError);

          const message = imageAiError instanceof Error ? imageAiError.message : "";

          if (
            message.includes("429") ||
            message.includes("Rate limit") ||
            message.includes("rate limit") ||
            message.includes("TPM")
          ) {
            throw new AppError(
              429,
              "AI_RATE_LIMIT",
              "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
            );
          }

          if (message.includes("IMAGE_AI_TIMEOUT")) {
            throw new AppError(
              422,
              "ANALYSIS_NOT_SAFE",
              "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
            );
          }

          if (isInvalidImageAiError(imageAiError)) {
            throw new AppError(
              422,
              "IMAGE_MENU_NOT_READABLE",
              "Diese Bild-Speisekarte konnte nicht sicher gelesen werden. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein."
            );
          }

          if (
            message.includes("Profilregeln") ||
            message.includes("keine sicher") ||
            message.includes("NO_SAFE")
          ) {
            throw new AppError(
              422,
              "NO_SAFE_RECOMMENDATIONS",
              "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
            );
          }

          throw imageAiError;
        }
      }
    }

    if (dishes.length === 0) {
      const partialData = buildPartialAnalysisPayload(restaurantDescription, htmlMenuExtraction, []);

      if (partialData) {
        return NextResponse.json({
          ok: true,
          data: partialData
        });
      }

      if (looksLikeUrl(rawMenuText)) {
        throw new AppError(
          422,
          "ANALYSIS_NOT_SAFE",
          "Ich konnte diese Speisekarte nicht sicher auswerten. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein.",
          buildMenuAnalysisDetails(restaurantDescription, htmlMenuExtraction)
        );
      }

      throw new AppError(400, "NO_DISHES_FOUND", "PickForMe konnte noch keine Gerichte erkennen.");
    }

    const recommendations = recommendDishes({
      dishes,
      profile: body.profile,
      situation: body.situation
    });

    if (recommendations.length === 0) {
      const partialData = buildPartialAnalysisPayload(restaurantDescription, htmlMenuExtraction, dishes);

      if (partialData) {
        return NextResponse.json({
          ok: true,
          data: partialData
        });
      }

      throw new AppError(
        422,
        "NO_SAFE_RECOMMENDATIONS",
        "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
        buildMenuAnalysisDetails(restaurantDescription, htmlMenuExtraction)
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        mode: "fallback",
        dishes,
        recommendations,
        conciergeHero: await buildConciergeHeroFromOfficialWebsiteText({
            officialWebsiteText: restaurantDescription?.text,
            restaurantUrl: officialRestaurantUrl,
            fallbackHero: buildFallbackConciergeHero({
              dishes,
              restaurantContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`
            })
        }),
        ...buildRestaurantDescriptionPayload(restaurantDescription),
        ...buildMenuExtractionPayload(htmlMenuExtraction)
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}


function buildRestaurantDescriptionPayload(restaurantDescription: RestaurantDescriptionResult | null) {
  if (!restaurantDescription) {
    return {};
  }

  return {
    restaurantDescription: restaurantDescription.text,
    restaurantDescriptionSource: restaurantDescription.source,
    restaurantDescriptionUrl: restaurantDescription.sourceUrl
  };
}

function buildMenuExtractionPayload(htmlMenuExtraction: MenuExtractionResult | null) {
  return htmlMenuExtraction
    ? {
        menuExtraction: htmlMenuExtraction
      }
    : {};
}

function buildMenuAnalysisDetails(
  restaurantDescription: RestaurantDescriptionResult | null,
  htmlMenuExtraction: MenuExtractionResult | null
) {
  const details = {
    ...buildRestaurantDescriptionPayload(restaurantDescription),
    ...buildMenuExtractionPayload(htmlMenuExtraction)
  };

  return Object.keys(details).length > 0 ? details : undefined;
}

function buildPartialAnalysisPayload(
  restaurantDescription: RestaurantDescriptionResult | null,
  htmlMenuExtraction: MenuExtractionResult | null,
  dishes: Dish[]
) {
  if (!restaurantDescription) {
    return null;
  }

  return {
    mode: "fallback" as const,
    dishes,
    recommendations: [],
    conciergeHero: "",
    analysisStatus: "analysis_not_safe" as const,
    analysisWarning: "Ich konnte diese Speisekarte nicht sicher auswerten.",
    ...buildRestaurantDescriptionPayload(restaurantDescription),
    ...buildMenuExtractionPayload(htmlMenuExtraction)
  };
}

async function buildConciergeHeroFromOfficialWebsiteText({
  officialWebsiteText,
  restaurantUrl,
  fallbackHero
}: {
  officialWebsiteText: string | undefined;
  restaurantUrl?: string;
  fallbackHero: string;
}) {
  const officialText = officialWebsiteText?.trim();

  if (!officialText) {
    return fallbackHero;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return "";
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Verdichte ausschliesslich die folgende offizielle Restaurantbeschreibung.",
            "Interpretiere nicht.",
            "Empfiehl nichts.",
            "Wirb nicht.",
            "Gib nur die offizielle Restaurantbeschreibung in maximal zwei Saetzen wieder.",
            "",
            `URL:\n${restaurantUrl ?? ""}`,
            "",
            "Extrahiere ausschliesslich:",
            "- Restaurantname",
            "- Lage",
            "- Selbstbeschreibung",
            "- Philosophie",
            "- Kuechenstil",
            "- Tradition",
            "- Besonderheiten, die das Restaurant selbst hervorhebt",
            "",
            "Ignoriere vollstaendig:",
            "- Navigation",
            "- Cookie-Hinweise",
            "- Impressum",
            "- Kontaktinformationen",
            "- Reservierung",
            "- Oeffnungszeiten",
            "- SEO-Titel",
            "- Meta-Texte",
            "- Social-Media",
            "- Werbung",
            "",
            "Wenn die Homepage nicht in der Sprache des Nutzers geschrieben ist, uebersetze den relevanten Inhalt vollstaendig in die Sprache des Nutzers.",
            "Wenn die Website mehrere Sprachen enthaelt, verwende ausschliesslich den Inhalt in der Sprache des Nutzers.",
            "Falls diese Sprache nicht vorhanden ist, verwende die Originalsprache und uebersetze sie vollstaendig.",
            "",
            "Danach:",
            "- verdichte den Inhalt auf maximal zwei Saetze",
            "- aendere keine Fakten",
            "- ergaenze keine Informationen",
            "- benutze keine externen Quellen",
            "- erfinde nichts",
            "- keine Empfehlung",
            "- keine Bewertung",
            "- keine Interpretation",
            "- keine Werbung"
          ].join("\n")
        },
        {
          role: "user",
          content: officialText.slice(0, 5000)
        }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    console.error("PickForMe official website hero editor failed.", error);
    return "";
  }
}

function getOfficialRestaurantHomepageUrl(value: string): string | undefined {
  try {
    return `${new URL(value).origin}/`;
  } catch {
    return undefined;
  }
}

function isInvalidImageAiError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return status === 400 && (
    message.includes("valid image") ||
    message.includes("invalid image") ||
    message.includes("supported formats") ||
    message.includes("image data")
  );
}

function buildFallbackConciergeHero({
  dishes = [],
  menuType,
  recommendationMode,
  restaurantContextText,
  officialWebsiteText
}: FallbackHeroContext) {
  const officialWebsiteHero = buildOfficialWebsiteHero(officialWebsiteText);

  if (officialWebsiteHero) {
    return officialWebsiteHero;
  }

  const restaurantText = normalizeHeroText(restaurantContextText ?? "");
  const menuText = normalizeHeroText([
    menuType,
    recommendationMode,
    ...dishes.flatMap((dish) => [
      dish.nameOriginal,
      dish.descriptionOriginal,
      dish.category,
      dish.sourceLine
    ])
  ].filter(Boolean).join(" "));
  const combinedText = `${restaurantText} ${menuText}`.trim();

  const restaurantHero = buildRestaurantContextHero(restaurantText);

  if (restaurantHero) {
    return restaurantHero;
  }

  if (
    recommendationMode === "whole_menu" ||
    hasAnyHeroTerm(combinedText, ["tasting menu", "degustationsmenu", "degustationsmenue", "set menu", "gaenge menu", "gaenge menue", "whole menu"])
  ) {
    return "Dieses Restaurant setzt auf ein kuratiertes Menueerlebnis. Hier steht das Menue als Ganzes im Vordergrund, nicht der Vergleich einzelner Gaenge.";
  }

  if (
    recommendationMode === "sharing_menu" ||
    hasAnyHeroTerm(combinedText, ["sharing", "tapas", "mezze", "platte", "platten", "zum teilen"])
  ) {
    return "Diese Karte ist auf gemeinsames Bestellen ausgelegt. Die Auswahl ergibt deshalb vor allem als stimmige Entscheidung fuer den Tisch Sinn.";
  }

  if (hasAnyHeroTerm(combinedText, ["pasta", "pizza", "risotto", "antipasti", "trattoria", "italien", "bruschetta", "pinsa", "gnocchi", "tagliatelle", "spaghetti"])) {
    return "Die Karte ist klassisch italienisch gepraegt. Im Vordergrund stehen die Optionen, die diesen Stil des Hauses am klarsten zeigen.";
  }

  if (hasAnyHeroTerm(combinedText, ["steak", "rind", "beef", "grill", "bbq", "burger", "entrecote", "ribeye", "roastbeef", "fleisch", "duroc", "iberico"])) {
    return "Diese Karte ist klar fleischorientiert. Die Auswahl konzentriert sich deshalb zuerst auf die Gerichte, die diese Ausrichtung am deutlichsten zeigen.";
  }

  if (hasAnyHeroTerm(combinedText, ["fraenkisch", "frankisch", "regional", "traditionell", "schaeufele", "schaufel", "braten", "kloesse", "knodel", "rauchbier", "hausgemacht"])) {
    return "Diese Karte ist regional und traditionell gepraegt. Die naheliegenden Entscheidungen liegen deshalb zuerst bei den Klassikern des Hauses.";
  }

  if (hasAnyHeroTerm(combinedText, ["sushi", "sashimi", "ramen", "tempura", "yakitori", "izakaya"])) {
    return "Diese Karte ist japanisch gepraegt. Die Empfehlungen orientieren sich deshalb zuerst an diesem klaren Kuechenstil.";
  }

  return "Diese Karte ist breit aufgestellt. Die Auswahl konzentriert sich zuerst auf die klarsten Hauptoptionen und gleicht sie danach mit Deinem Profil ab.";
}

function buildRestaurantContextHero(text: string) {
  if (!text) {
    return undefined;
  }

  if (hasAnyHeroTerm(text, ["trattoria", "osteria", "ristorante", "pizzeria", "italian", "italienisch"])) {
    return "Dieses Restaurant ist italienisch gepraegt. Die Karte wird deshalb zuerst danach gelesen, welche Optionen diesen Stil am klarsten tragen.";
  }

  if (hasAnyHeroTerm(text, ["steakhouse", "grillhouse", "bbq", "asador", "parrilla"])) {
    return "Dieses Restaurant ist fleisch- und grillorientiert. Die Auswahl konzentriert sich deshalb zuerst auf die Optionen, die diese Ausrichtung am klarsten abbilden.";
  }

  if (hasAnyHeroTerm(text, ["weinbar", "winebar", "wine bar", "vinoteca", "enoteca"])) {
    return "Dieses Restaurant ist als Weinbar mit begleitendem Essen angelegt. Die Empfehlungen folgen deshalb einem eher kuratierten Rahmen.";
  }

  if (hasAnyHeroTerm(text, ["sushi", "izakaya", "ramen", "japanese", "japanisch"])) {
    return "Dieses Restaurant ist japanisch gepraegt. Die Empfehlungen folgen deshalb zuerst diesem klaren Kuechenstil.";
  }

  if (hasAnyHeroTerm(text, ["tapas", "mezze", "sharing"])) {
    return "Dieses Restaurant ist auf gemeinsames Bestellen ausgelegt. Die Auswahl wird deshalb zuerst als Tischentscheidung betrachtet, nicht als einzelne Solowahl.";
  }

  if (hasAnyHeroTerm(text, ["fine dining", "degustation", "tasting", "menuerlebnis", "menueerlebnis"])) {
    return "Dieses Restaurant ist auf ein kuratiertes Restauranterlebnis ausgelegt. Die Karte wird deshalb zuerst als Konzept gelesen und erst danach als einzelne Auswahl.";
  }

  return undefined;
}

function buildOfficialWebsiteHero(value: string | undefined) {
  const officialText = cleanOfficialWebsiteHeroText(value ?? "");

  if (!officialText) {
    return undefined;
  }

  const translated = translateOfficialWebsiteHeroToGerman(officialText);

  return clampHeroLength(translated);
}

function cleanOfficialWebsiteHeroText(value: string) {
  const candidates = value
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((part) => cleanOfficialContextText(part))
    .map(removeSeoTitleFragments)
    .filter(isAllowedOfficialHeroSentence);
  const usefulCandidates = candidates.filter(isUsefulOfficialHeroSentence);
  const selectedCandidates = dedupeOfficialHeroSentences(
    usefulCandidates.length > 0 ? usefulCandidates : candidates
  ).slice(0, 3);

  return selectedCandidates.join(" ").trim();
}

function removeSeoTitleFragments(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const parts = normalized
    .split(/\s(?:[|–—-]|::|»)\s/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return normalized;
  }

  const descriptiveParts = parts.filter((part) => isUsefulOfficialHeroSentence(part));

  return (descriptiveParts[0] ?? parts.find((part) => part.length > 35) ?? "").trim();
}

function dedupeOfficialHeroSentences(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeHeroText(value);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isAllowedOfficialHeroSentence(value: string) {
  const normalized = normalizeHeroText(value);

  if (value.length < 30 || value.length > 1200) {
    return false;
  }

  if (/[€$£]\s?\d|\d+[,.]\d{2}/.test(value)) {
    return false;
  }

  if (hasAnyHeroTerm(normalized, [
    "cookie",
    "privacy",
    "datenschutz",
    "impressum",
    "reserv",
    "book",
    "opening",
    "oeffnungszeiten",
    "kontakt",
    "menu pdf",
    "speisekarte pdf",
    "newsletter",
    "copyright",
    "home",
    "homepage",
    "skip to",
    "toggle",
    "navigation",
    "language",
    "powered by",
    "wordpress",
    "ristorante il pozzetto roma borgo pio roma",
    "welcome",
    "benvenuti",
    "scopri",
    "discover",
    "best restaurant",
    "miglior",
    "excellent",
    "eccellente",
    "specialita",
    "speciality",
    "vi aspettiamo"
  ])) {
    return false;
  }

  if (normalized.split(" ").length < 5) {
    return false;
  }

  return true;
}

function isUsefulOfficialHeroSentence(value: string) {
  const normalized = normalizeHeroText(value);

  return hasAnyHeroTerm(normalized, [
    "located",
    "lage",
    "liegt",
    "close to",
    "near",
    "historic",
    "tradition",
    "traditional",
    "mediterranean",
    "mediterran",
    "cuisine",
    "kueche",
    "restaurant",
    "trattoria",
    "osteria",
    "ristorante",
    "fresh",
    "frisch",
    "regional",
    "concept",
    "konzept",
    "family",
    "familie"
  ]);
}

function translateOfficialWebsiteHeroToGerman(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const translated = sentences.map(translateOfficialSentenceToGerman);

  return translated.join(" ");
}

function translateOfficialSentenceToGerman(sentence: string) {
  const trimmed = sentence.trim();
  const normalized = normalizeHeroText(trimmed);

  if (/carefully selected cuisine/i.test(trimmed) || /freshest,?\s*quality ingredients/i.test(trimmed)) {
    const mediterraneanPrefix = /mediterranean/i.test(trimmed) ? "Die Kueche ist mediterran gepraegt und " : "Die Kueche ";

    return `${mediterraneanPrefix}basiert laut Restaurant auf sorgfaeltig ausgewaehlten, frischen Zutaten.`;
  }

  if (/mediterranean/i.test(trimmed) && /tradition/i.test(trimmed)) {
    return "Die Kueche ist laut Restaurant mediterran und traditionell gepraegt.";
  }

  if (
    hasAnyHeroTerm(normalized, ["borgo pio"]) &&
    hasAnyHeroTerm(normalized, ["vatican", "vaticano", "vatikan", "san pietro"])
  ) {
    return "Il Pozzetto liegt im historischen Borgo Pio nahe dem Vatikan.";
  }

  if (
    hasAnyHeroTerm(normalized, ["cucina mediterranea", "mediterranean cuisine", "cuisine mediterranean"]) ||
    hasAnyHeroTerm(normalized, ["freshest quality ingredients", "ingredienti freschi", "ingredienti di qualita"])
  ) {
    const mediterraneanPrefix = hasAnyHeroTerm(normalized, ["mediterranean", "mediterranea", "mediterraneo"])
      ? "Die Kueche ist mediterran gepraegt und "
      : "Die Kueche ";

    return `${mediterraneanPrefix}basiert laut Restaurant auf sorgfaeltig ausgewaehlten, frischen Zutaten.`;
  }

  if (hasAnyHeroTerm(normalized, ["tradizionale", "tradizionali", "traditional"])) {
    return "Die Kueche ist laut Restaurant traditionell gepraegt.";
  }

  const locationMatch = trimmed.match(/^(.+?)\s+is located\s+(?:in|at)\s+(.+?)(?:,\s*close to\s+(.+?))?\.?$/i);

  if (locationMatch?.[1] && locationMatch[2]) {
    const place = translateLocationPhrase(locationMatch[2]);
    const nearby = locationMatch[3] ? ` nahe ${translateLocationPhrase(locationMatch[3])}` : "";

    return `${locationMatch[1]} liegt ${place}${nearby}.`;
  }

  if (/carefully selected cuisine/i.test(trimmed) || /freshest,\s*quality ingredients/i.test(trimmed)) {
    return "Die Küche basiert laut Restaurant auf sorgfältig ausgewählten, frischen Zutaten.";
  }

  if (/mediterranean/i.test(trimmed) && /tradition/i.test(trimmed)) {
    return "Die Küche ist laut Restaurant mediterran und traditionell geprägt.";
  }

  return ensureSentencePunctuation(trimmed);
}

function translateLocationPhrase(value: string) {
  return value
    .replace(/\bthe historic\b/gi, "im historischen")
    .replace(/\bhistoric\b/gi, "historischen")
    .replace(/\bVatican City\b/gi, "dem Vatikan")
    .replace(/\bthe Vatican\b/gi, "dem Vatikan")
    .replace(/\bRome\b/gi, "Rom")
    .replace(/\bclose to\b/gi, "nahe")
    .trim();
}

function clampHeroLength(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 320) {
    return normalized;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const shortened = sentences.reduce<string[]>((parts, sentence) => {
    const next = [...parts, sentence].join(" ");
    return next.length <= 320 ? [...parts, sentence] : parts;
  }, []);

  return (shortened.join(" ") || `${normalized.slice(0, 300).trim()}...`).trim();
}

function ensureSentencePunctuation(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function hasAnyHeroTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function normalizeHeroText(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function askPdfWithShortRateLimitRetry(input: Parameters<typeof askPickForMePdfUrlAI>[0]) {
  try {
    return await askPickForMePdfUrlAI(input);
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    const retryDelayMs = getShortRetryDelayMs(error);

    if (retryDelayMs === undefined) {
      throw error;
    }

    await sleep(retryDelayMs);
    return askPickForMePdfUrlAI(input);
  }
}

function isRateLimitError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = error instanceof Error ? error.message : "";

  return status === 429 ||
    message.includes("429") ||
    message.includes("Rate limit") ||
    message.includes("rate limit") ||
    message.includes("TPM");
}

function getShortRetryDelayMs(error: unknown) {
  const headerDelay = getRetryAfterDelayMs(error) ?? getResetDelayMs(error);
  const retryDelayMs = headerDelay ?? 1000;

  return retryDelayMs <= 3000 ? retryDelayMs : undefined;
}

function getRetryAfterDelayMs(error: unknown) {
  const value = getErrorHeader(error, "retry-after");

  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function getResetDelayMs(error: unknown) {
  const value = getErrorHeader(error, "x-ratelimit-reset-requests") ??
    getErrorHeader(error, "x-ratelimit-reset-tokens");

  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)?$/i);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "s";

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return unit === "ms" ? amount : amount * 1000;
}

function getErrorHeader(error: unknown, name: string) {
  if (typeof error !== "object" || error === null || !("headers" in error)) {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;

  if (!headers) {
    return undefined;
  }

  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (headerName: string) => unknown }).get(name);
    return typeof value === "string" ? value : undefined;
  }

  if (typeof headers === "object" && headers !== null) {
    const value = (headers as Record<string, unknown>)[name] ??
      (headers as Record<string, unknown>)[name.toLowerCase()];
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withAbortTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorCode: string
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const promise = factory(controller.signal);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new Error(errorCode));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);

        if (didTimeout) {
          return;
        }

        reject(error);
      });
  });
}








function looksLikePdfUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

async function loadOfficialRestaurantContextFromUrl(value: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return undefined;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return undefined;
    }

    return extractOfficialRestaurantContext(await response.text());
  } catch {
    return undefined;
  }
}

async function loadOfficialRestaurantContextFromOrigin(value: string): Promise<string | undefined> {
  try {
    const inputUrl = new URL(value);
    const homepageUrl = `${inputUrl.origin}/`;

    return loadOfficialRestaurantContextFromUrl(homepageUrl);
  } catch {
    return undefined;
  }
}

async function findLinkedPdfMenu(value: string): Promise<LinkedPdfMenu | null> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return null;
    }

    const finalUrl = response.url || value;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (looksLikePdfUrl(finalUrl) || contentType.includes("application/pdf")) {
      return { url: finalUrl };
    }

    const html = await response.text();
    const candidates = extractPdfCandidates(html, finalUrl);
    const url = candidates.find((candidate) => scorePdfCandidate(candidate) > 0);

    return url
      ? {
          url,
          restaurantContextText: extractOfficialRestaurantContext(html)
        }
      : null;
  } catch {
    return null;
  }
}

function extractOfficialRestaurantContext(html: string): string | undefined {
  const parts = [
    ...extractMetaContents(html),
    ...extractHtmlTextSnippets(html)
  ]
    .map(cleanOfficialContextText)
    .filter((part) => part.length >= 30);
  const seen = new Set<string>();
  const uniqueParts = parts.filter((part) => {
    const key = part.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
  const context = uniqueParts.join("\n").slice(0, 1200).trim();

  return context || undefined;
}

function extractMetaContents(html: string): string[] {
  const contents: string[] = [];
  const metaPattern = /<meta\b[^>]*>/gi;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    contents.push(titleMatch[1]);
  }

  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html)) !== null) {
    const tag = match[0];

    if (!/\b(?:name|property)=["'](?:description|og:description|twitter:description)["']/i.test(tag)) {
      continue;
    }

    const contentMatch = tag.match(/\bcontent=["']([^"']+)["']/i);

    if (contentMatch?.[1]) {
      contents.push(contentMatch[1]);
    }
  }

  return contents;
}

function extractHtmlTextSnippets(html: string): string[] {
  const snippets: string[] = [];
  const textPattern = /<(?:h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p)>/gi;
  let match: RegExpExecArray | null;

  while ((match = textPattern.exec(html)) !== null && snippets.join(" ").length < 1200) {
    if (match[1]) {
      snippets.push(match[1]);
    }
  }

  return snippets;
}

function cleanOfficialContextText(value: string): string {
  return decodeHtmlAttribute(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&auml;/gi, "ae")
    .replace(/&ouml;/gi, "oe")
    .replace(/&uuml;/gi, "ue")
    .replace(/&Auml;/gi, "Ae")
    .replace(/&Ouml;/gi, "Oe")
    .replace(/&Uuml;/gi, "Ue")
    .replace(/&szlig;/gi, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfCandidates(html: string, baseUrl: string): string[] {
  const candidates = new Set<string>();
  const pattern = /\b(?:href|src)=["']([^"']+)["']/gi;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const rawValue = decodeHtmlAttribute(match[1] ?? "");

    if (!rawValue.toLowerCase().includes(".pdf")) {
      continue;
    }

    try {
      candidates.add(new URL(rawValue, baseUrl).toString());
    } catch {
      // ignore invalid links
    }
  }

  return [...candidates].sort((a, b) => scorePdfCandidate(b) - scorePdfCandidate(a));
}

function scorePdfCandidate(value: string): number {
  const normalized = decodeURIComponent(value.toLowerCase());
  let score = 0;

  if (normalized.includes("deutsch")) score += 5;
  if (normalized.includes("german")) score += 5;
  if (normalized.includes("speisekarte")) score += 6;
  if (normalized.includes("menu")) score += 3;
  if (normalized.includes("menue")) score += 3;
  if (normalized.includes("menü")) score += 3;
  if (normalized.includes("food")) score += 3;
  if (normalized.includes("essen")) score += 3;
  if (normalized.includes("speisen")) score += 4;

  if (normalized.includes("weinkarte")) score -= 10;
  if (normalized.includes("wine")) score -= 10;
  if (normalized.includes("getraenk")) score -= 10;
  if (normalized.includes("getränk")) score -= 10;
  if (normalized.includes("drinks")) score -= 10;
  if (normalized.includes("cocktail")) score -= 10;

  if (normalized.includes("english")) score -= 3;
  if (normalized.includes("englisch")) score -= 3;
  return score;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

function isKnownDynamicMenuPlatform(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return hostname === "menury.com" || hostname.endsWith(".menury.com");
  } catch {
    return false;
  }
}


async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
