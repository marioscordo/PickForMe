import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { getSupabaseAdmin } from "../../../src/supabase/supabaseAdmin";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

const CATEGORY_VALUES = new Set([
  "menu_discovery",
  "photo_menu",
  "recommendation",
  "profile",
  "allergens_exclusions",
  "login",
  "display",
  "other"
]);

const SEVERITY_VALUES = new Set(["blocker", "annoying", "minor"]);

const MAX_SHORT_TEXT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 1600;
const MAX_LONG_TEXT_LENGTH = 1200;
const MAX_LOCALE_LENGTH = 32;

type TestFeedbackBody = {
  appVersion?: unknown;
  buildNumber?: unknown;
  category?: unknown;
  city?: unknown;
  contactAllowed?: unknown;
  description?: unknown;
  deviceModel?: unknown;
  expectedBehavior?: unknown;
  locale?: unknown;
  osVersion?: unknown;
  platform?: unknown;
  restaurantName?: unknown;
  screenContext?: unknown;
  severity?: unknown;
  stepsToReproduce?: unknown;
  submittedAt?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as TestFeedbackBody;
    const report = parseTestFeedbackBody(body);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("test_feedback_reports").insert({
      app_version: report.appVersion,
      build_number: report.buildNumber,
      category: report.category,
      city: report.city,
      contact_allowed: report.contactAllowed,
      device_model: report.deviceModel,
      expected_behavior: report.expectedBehavior,
      locale: report.locale,
      message: report.description,
      os_version: report.osVersion,
      platform: report.platform,
      restaurant_name: report.restaurantName,
      screen_context: report.screenContext,
      severity: report.severity,
      steps_to_reproduce: report.stepsToReproduce,
      submitted_at: report.submittedAt,
      user_id: user.id === DEV_USER_ID ? null : user.id
    });

    if (error) {
      throw new AppError(500, "TEST_FEEDBACK_INSERT_FAILED", "Die Fehlermeldung konnte nicht gespeichert werden.");
    }

    return NextResponse.json({
      ok: true,
      data: {
        submitted: true
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseTestFeedbackBody(body: TestFeedbackBody) {
  const category = parseCategory(body.category);
  const severity = parseOptionalEnum(body.severity, SEVERITY_VALUES, "INVALID_TEST_FEEDBACK_SEVERITY");
  const description = parseRequiredText(
    body.description,
    MAX_MESSAGE_LENGTH,
    "INVALID_TEST_FEEDBACK_DESCRIPTION"
  );
  const submittedAt = parseSubmittedAt(body.submittedAt);

  return {
    appVersion: parseOptionalText(body.appVersion, MAX_SHORT_TEXT_LENGTH),
    buildNumber: parseOptionalText(body.buildNumber, MAX_SHORT_TEXT_LENGTH),
    category,
    city: parseOptionalText(body.city, MAX_SHORT_TEXT_LENGTH),
    contactAllowed: typeof body.contactAllowed === "boolean" ? body.contactAllowed : false,
    description,
    deviceModel: parseOptionalText(body.deviceModel, MAX_SHORT_TEXT_LENGTH),
    expectedBehavior: parseOptionalText(body.expectedBehavior, MAX_LONG_TEXT_LENGTH),
    locale: parseOptionalText(body.locale, MAX_LOCALE_LENGTH),
    osVersion: parseOptionalText(body.osVersion, MAX_SHORT_TEXT_LENGTH),
    platform: parseOptionalText(body.platform, MAX_SHORT_TEXT_LENGTH),
    restaurantName: parseOptionalText(body.restaurantName, MAX_SHORT_TEXT_LENGTH),
    screenContext: parseOptionalText(body.screenContext, MAX_SHORT_TEXT_LENGTH),
    severity,
    stepsToReproduce: parseOptionalText(body.stepsToReproduce, MAX_LONG_TEXT_LENGTH),
    submittedAt
  };
}

function parseCategory(value: unknown) {
  if (typeof value !== "string" || !CATEGORY_VALUES.has(value)) {
    throw new AppError(400, "INVALID_TEST_FEEDBACK_CATEGORY", "Bitte wähle eine Kategorie aus.");
  }

  return value;
}

function parseOptionalEnum(value: unknown, allowedValues: Set<string>, code: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !allowedValues.has(value)) {
    throw new AppError(400, code, "Ungültiger Auswahlwert.");
  }

  return value;
}

function parseRequiredText(value: unknown, maxLength: number, code: string) {
  const text = parseOptionalText(value, maxLength);

  if (!text) {
    throw new AppError(400, code, "Bitte beschreibe kurz, was passiert ist.");
  }

  return text;
}

function parseOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function parseSubmittedAt(value: unknown) {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime())
    ? new Date().toISOString()
    : timestamp.toISOString();
}
