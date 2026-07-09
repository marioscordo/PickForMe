import { NextResponse } from "next/server";
import { z } from "zod";
import {
  classifyProfileInputAI,
  classifyProfilePreferenceAI,
  classifyProfileInputDeterministically
} from "../../../src/ai/classifyProfilePreferenceAI";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";

const ProfilePreferenceClassificationRequestSchema = z.object({
  inputKind: z.enum(["preference", "exclusion"]).optional(),
  value: z.string().max(240)
});

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const parsedBody = ProfilePreferenceClassificationRequestSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      throw new AppError(
        400,
        "PROFILE_PREFERENCE_CLASSIFICATION_INVALID_REQUEST",
        "Bitte eine Vorliebe eingeben.",
        parsedBody.error.issues
      );
    }

    const inputKind = parsedBody.data.inputKind ?? "preference";
    const deterministicResult = classifyProfileInputDeterministically(parsedBody.data.value);

    if (deterministicResult) {
      return NextResponse.json({
        ok: true,
        data: deterministicResult
      });
    }

    if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
      throw new AppError(
        400,
        "PROFILE_PREFERENCE_CLASSIFICATION_AI_DISABLED",
        "Eigene Profileingaben benoetigen den KI-Modus."
      );
    }

    const data = inputKind === "preference"
      ? await classifyProfilePreferenceAI({
        value: parsedBody.data.value
      })
      : await classifyProfileInputAI({
        inputKind,
        value: parsedBody.data.value
      });

    return NextResponse.json({
      ok: true,
      data
    });
  } catch (error) {
    return errorResponse(error);
  }
}
