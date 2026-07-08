import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { stripJsonFence } from "../../../src/ai/twoStepRecommendationAIUtils";

const MAX_IMAGE_BASE64_LENGTH = 10_000_000;
const MIN_MENU_TEXT_LENGTH = 20;

const MenuPhotoTextRequestSchema = z.object({
  imageBase64: z.string().trim().min(100).max(MAX_IMAGE_BASE64_LENGTH),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png"]).optional().default("image/jpeg")
});

const MenuPhotoTextResponseSchema = z.object({
  menuText: z.string().optional().default("")
});

export async function POST(request: Request) {
  try {
    await requireUser(request);

    if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
      throw new AppError(400, "PHOTO_TEXT_AI_DISABLED", "Speisekartenfotos benoetigen den KI-Modus.");
    }

    const parsedBody = MenuPhotoTextRequestSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      throw new AppError(
        400,
        "MENU_PHOTO_INVALID_REQUEST",
        "Das Speisekartenfoto konnte nicht verarbeitet werden.",
        parsedBody.error.issues
      );
    }

    const menuText = await transcribeMenuPhoto(parsedBody.data);

    if (menuText.trim().length < MIN_MENU_TEXT_LENGTH) {
      throw new AppError(
        422,
        "NO_MENU_TEXT_RECOGNIZED",
        "Ich konnte auf dem Foto keinen ausreichenden Speisekartentext lesen."
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        menuText
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function transcribeMenuPhoto({
  imageBase64,
  mimeType
}: {
  imageBase64: string;
  mimeType: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(500, "OPENAI_ENV_MISSING", "OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });
  const model =
    process.env.OPENAI_IMAGE_MODEL ||
    process.env.OPENAI_PDF_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildPhotoTranscriptionPrompt()
          },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${imageBase64}`,
            detail: "high"
          }
        ]
      }
    ]
  });

  const outputText = stripJsonFence(response.output_text ?? "");
  const parsed = MenuPhotoTextResponseSchema.parse(JSON.parse(outputText));

  return normalizeTranscribedMenuText(parsed.menuText);
}

function buildPhotoTranscriptionPrompt() {
  return [
    "Du bist ein reiner OCR-/Transkriptionsadapter fuer GustaroAI.",
    "Aufgabe: Transkribiere ausschliesslich sichtbar lesbaren Speisekartentext aus dem Foto.",
    "Keine Empfehlungen.",
    "Keine Analyse.",
    "Keine Uebersetzung.",
    "Keine Zusammenfassung.",
    "Keine Restaurantbeschreibung.",
    "Keine Zutaten, Preise oder Gerichte ergaenzen.",
    "Nicht raten.",
    "Unlesbare, abgeschnittene oder unsichere Stellen weglassen oder als [unlesbar] markieren.",
    "Zeilenstruktur moeglichst erhalten.",
    "Wenn kein ausreichender Speisekartentext sichtbar ist, menuText als leeren String zurueckgeben.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    "  \"menuText\": \"sichtbar transkribierter Speisekartentext\"",
    "}"
  ].join("\n");
}

function normalizeTranscribedMenuText(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 50000);
}
