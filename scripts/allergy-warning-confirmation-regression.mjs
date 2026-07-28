import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const route = read("apps/api/app/api/safety/allergy-warning-confirmation/route.ts");
const mobileApi = read("apps/mobile/src/api/pickformeApi.ts");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");

assert(route.includes("logConfirmationSafely("), "Allergy warning route must use a dedicated safe logging wrapper");
assert(route.includes("const logged = await logConfirmationSafely("), "POST handler must await safe logging and continue");
assert(route.includes("return NextResponse.json({") && route.includes("logged"), "Route must return a successful response with logged state");

const postStart = route.indexOf("export async function POST");
const postEnd = route.indexOf("// Bewusst fail-open", postStart);
assert(postStart >= 0 && postEnd > postStart, "POST handler block must be findable");
const postBlock = route.slice(postStart, postEnd);
assert(!postBlock.includes("getSupabaseAdmin()"), "POST handler must not call Supabase directly");
assert(postBlock.includes("parseConfirmationVersion("), "POST handler must keep confirmation version validation");
assert(postBlock.includes("parseConfirmationTimestamp("), "POST handler must keep timestamp validation");
assert(postBlock.includes("return errorResponse(error);"), "POST handler must still fail closed for invalid auth or request data");

const safeLoggerStart = route.indexOf("async function logConfirmationSafely");
const parseStart = route.indexOf("function parseConfirmationVersion", safeLoggerStart);
assert(safeLoggerStart >= 0 && parseStart > safeLoggerStart, "Safe logger function must be findable");
const safeLogger = route.slice(safeLoggerStart, parseStart);

assert(safeLogger.includes("try {"), "Safe logger must wrap infrastructure work in try/catch");
assert(safeLogger.includes("const supabase = getSupabaseAdmin();"), "Safe logger must still attempt to write the audit log");
assert(safeLogger.includes('.from("allergy_warning_confirmations")'), "Safe logger must write to the allergy confirmation audit table");
assert(safeLogger.includes("console.error(\"allergy_warning_confirmations insert failed\""), "Insert errors must be logged server-side");
assert(safeLogger.includes("console.error(\"allergy_warning_confirmation logging failed, allowing confirmation to proceed\""), "Thrown logging errors must be logged server-side");
assert((safeLogger.match(/return false;/g) ?? []).length >= 2, "Safe logger must return false for insert and thrown logging failures");
assert(safeLogger.includes("return true;"), "Safe logger must return true after successful logging");
assert(!safeLogger.includes("throw error"), "Safe logger must not rethrow logging failures");
assert(!safeLogger.includes("return errorResponse"), "Safe logger must not turn logging failures into API errors");

assert(route.includes('throw new AppError(400, "INVALID_CONFIRMATION_VERSION"'), "Invalid confirmation version must remain a 400 error");
assert(route.includes('throw new AppError(400, "INVALID_CONFIRMATION_TIMESTAMP"'), "Invalid confirmation timestamp must remain a 400 error");
assert(route.includes("PICKFORME_USER_HASH_SALT"), "Route must keep stable salt support for pseudonymized user IDs");

assert(mobileApi.includes('"/api/safety/allergy-warning-confirmation"'), "Mobile API must keep using the allergy warning confirmation endpoint");
assert(pickScreen.includes("confirmAllergyWarningAndAnalyze"), "PickScreen must keep the explicit allergy warning confirmation flow");
assert(pickScreen.includes("await logAllergyWarningConfirmation"), "PickScreen must await warning confirmation logging before analysis");
assert(pickScreen.includes("startAnalyze()"), "PickScreen must keep the analysis continuation path");

console.log("allergy-warning-confirmation-regression: passed");
