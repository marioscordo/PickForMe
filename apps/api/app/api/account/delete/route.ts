import { NextResponse } from "next/server";
import { requireUser } from "../../../../src/auth/requireUser";
import { AppError } from "../../../../src/errors/AppError";
import { errorResponse } from "../../../../src/errors/errorResponse";
import { getSupabaseAdmin } from "../../../../src/supabase/supabaseAdmin";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    if (user.id === DEV_USER_ID) {
      throw new AppError(400, "ACCOUNT_DELETE_DEV_UNAVAILABLE", "ACCOUNT_DELETE_DEV_UNAVAILABLE");
    }

    const supabase = getSupabaseAdmin();
    const dataDeleteResults = await Promise.all([
      supabase.from("recommendation_feedback").delete().eq("user_id", user.id),
      supabase.from("user_profile_rules").delete().eq("user_id", user.id),
      supabase.from("user_profiles").delete().eq("user_id", user.id)
    ]);
    const dataDeleteError = dataDeleteResults.find((result) => result.error)?.error;

    if (dataDeleteError) {
      throw new AppError(500, "ACCOUNT_DATA_DELETE_FAILED", "ACCOUNT_DATA_DELETE_FAILED");
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);

    if (error) {
      throw new AppError(500, "ACCOUNT_DELETE_FAILED", "ACCOUNT_DELETE_FAILED");
    }

    return NextResponse.json({
      ok: true,
      data: {
        deleted: true
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
