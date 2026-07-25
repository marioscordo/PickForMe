import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function readHead(relativePath) {
  return execFileSync("git", ["show", `HEAD:${relativePath}`], { cwd: repoRoot, encoding: "utf8" }).replace(/\r\n/g, "\n");
}

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const authProvider = read("apps/mobile/src/app/providers/AuthProvider.tsx");
const loginScreen = read("apps/mobile/src/screens/auth/LoginScreen.tsx");
const registerScreen = read("apps/mobile/src/screens/auth/RegisterScreen.tsx");
const confirmEmailScreen = read("apps/mobile/src/screens/auth/ConfirmEmailScreen.tsx");
const rootNavigator = read("apps/mobile/src/app/navigation/RootNavigator.tsx");
const de = parseJson("apps/mobile/src/content/mobileContent.de-DE.json");
const en = parseJson("apps/mobile/src/content/mobileContent.en-US.json");

assert(read("apps/mobile/src/app/providers/ProfileProvider.tsx") === readHead("apps/mobile/src/app/providers/ProfileProvider.tsx"), "ProfileProvider.tsx must remain unchanged");
assert(read("apps/mobile/src/services/authLinkingService.ts") === readHead("apps/mobile/src/services/authLinkingService.ts"), "authLinkingService.ts must remain unchanged");
assert(read("apps/mobile/src/services/supabaseClient.ts") === readHead("apps/mobile/src/services/supabaseClient.ts"), "supabaseClient.ts must remain unchanged");

assert(authProvider.includes("signUp: (email: string, password: string) => Promise<SignUpResult>"), "AuthProvider must expose signUp in the auth context");
assert(authProvider.includes("supabase.auth.signUp({"), "AuthProvider signUp must use Supabase signUp");
assert(authProvider.includes("const normalized = email.trim().toLowerCase();"), "AuthProvider signUp must trim and lowercase email");
assert(authProvider.includes("password,"), "AuthProvider signUp must pass the original password value");
assert(!authProvider.includes("password.trim()"), "AuthProvider signUp must not trim passwords");
assert(!authProvider.includes("password.toLowerCase()"), "AuthProvider signUp must not lowercase passwords");
assert(authProvider.includes("emailRedirectTo: getAuthCallbackUrl()"), "AuthProvider signUp must pass variant-aware emailRedirectTo");
assert(authProvider.includes('status: "confirmation-required"'), "AuthProvider must represent confirmation-required signups");
assert(authProvider.includes('status: "authenticated"'), "AuthProvider must represent immediate authenticated signups");
assert(authProvider.includes("if (data.session)"), "AuthProvider must distinguish signups that already return a session");
assert(authProvider.includes("setState(authStateFromSession(data.session))"), "Immediate signup session must enter the existing auth state path");
assert(authProvider.includes("registrationFailed"), "Supabase signup errors must be mapped to a controlled UI-safe message");

assert(rootNavigator.includes('type AuthScreen = "login" | "register" | "confirm-email"'), "RootNavigator must keep minimal auth screen state");
assert(rootNavigator.includes("<RegisterScreen"), "RootNavigator must render the registration screen");
assert(rootNavigator.includes("<ConfirmEmailScreen"), "RootNavigator must render the confirm-email state");
assert(rootNavigator.includes("<LoginScreen onCreateAccount"), "RootNavigator must keep Login as the anonymous default with create-account entry");

assert(loginScreen.includes("env.devMode ? env.devEmail : \"\""), "LoginScreen must keep dev email prefill");
assert(loginScreen.includes("await auth.signIn(email, password)"), "LoginScreen must keep the existing signIn action");
assert(loginScreen.includes("content.auth.login.createAccount"), "LoginScreen must add the localized create-account action");

assert(registerScreen.includes("const MIN_PASSWORD_LENGTH = 8"), "Registration must enforce minimum password length 8");
assert(registerScreen.includes("isPlausibleEmail(normalizedEmail)"), "Registration must validate plausible email syntax");
assert(registerScreen.includes("const normalizedEmail = email.trim().toLowerCase();"), "Registration screen must trim and lowercase email before validation");
assert(registerScreen.includes("password.length < MIN_PASSWORD_LENGTH"), "Registration must validate password length without trimming");
assert(registerScreen.includes("passwordConfirmation !== password"), "Registration must compare password confirmation exactly");
assert(registerScreen.includes("const submittingRef = useRef(false)"), "Registration must use a synchronous duplicate-submit guard");
assert(registerScreen.includes("if (submittingRef.current)"), "Registration must block fast duplicate submits");
assert(registerScreen.includes("disabled={submitting}"), "Registration submit controls must be disabled while pending");
assert(registerScreen.includes("await auth.signUp(email, password)"), "Registration must call the AuthProvider signUp method");
assert(registerScreen.includes('result.status === "confirmation-required"'), "Confirmation-required signup must move to the confirm-email state");
assert(registerScreen.includes("onConfirmEmail(result.email)"), "Confirm-email state must receive the normalized registered email");
assert(registerScreen.includes('result.status === "error"'), "Network or Supabase errors must stay on the registration form");
assert(!registerScreen.includes("password.trim()"), "Registration screen must not trim passwords");
assert(!registerScreen.includes("password.toLowerCase()"), "Registration screen must not lowercase passwords");
assert(!registerScreen.includes("resetPasswordForEmail") && !registerScreen.includes("updateUser({ password"), "Registration must not implement password recovery");
assert(!registerScreen.includes("terms") && !registerScreen.includes("Terms"), "Registration must not invent a terms URL");
assert(registerScreen.includes("env.privacyUrl"), "Registration must use the existing privacy URL");
assert(registerScreen.includes("Linking.openURL(withLegalLanguage(env.privacyUrl, guiLanguage))"), "Registration must open the existing privacy URL through external linking");

assert(confirmEmailScreen.includes("registeredEmailLabel"), "Confirm-email state must label the registered email");
assert(confirmEmailScreen.includes("neutralExistingAccountNotice"), "Confirm-email state must include the neutral existing-account notice");
assert(confirmEmailScreen.includes("onBackToLogin"), "Confirm-email state must allow returning to Login");
assert(!confirmEmailScreen.includes("resend") && !confirmEmailScreen.includes("Resend"), "Confirm-email state must not add resend email");

for (const file of [authProvider, loginScreen, registerScreen, confirmEmailScreen, rootNavigator]) {
  assert(!file.includes("console.log") && !file.includes("console.info") && !file.includes("console.error"), "Registration changes must not add email, password, user, session, or callback logging");
}

assert(read("apps/mobile/src/services/authLinkingService.ts").includes('return env.devMode ? "gustaroai-dev" : "gustaroai";'), "Development auth callback scheme must remain gustaroai-dev");
assert(read("apps/mobile/src/services/authLinkingService.ts").includes("getAuthCallbackUrl()"), "Production auth callback URL helper must remain available");
assert(read("apps/mobile/src/services/authLinkingService.ts").includes("AUTH_CALLBACK_HOST = \"auth\"") && read("apps/mobile/src/services/authLinkingService.ts").includes("AUTH_CALLBACK_PATH = \"/callback\""), "Auth callback must remain limited to auth/callback");

const requiredRegisterKeys = [
  "title",
  "emailLabel",
  "passwordLabel",
  "confirmPasswordLabel",
  "submit",
  "loading",
  "backToLogin",
  "privacyNoticePrefix",
  "privacyLink",
  "privacyNoticeSuffix",
  "invalidEmail",
  "passwordTooShort",
  "passwordMismatch",
  "genericError",
  "checkEmailTitle",
  "checkEmailBody",
  "checkSpam",
  "registeredEmailLabel",
  "neutralExistingAccountNotice"
];

for (const [locale, content] of [["de-DE", de], ["en-US", en]]) {
  assert(content.auth?.login?.createAccount, `${locale}: auth.login.createAccount missing`);
  for (const key of requiredRegisterKeys) {
    assert(typeof content.auth?.register?.[key] === "string" && content.auth.register[key].length > 0, `${locale}: auth.register.${key} missing`);
  }
  assert(content.authErrors?.registrationFailed, `${locale}: authErrors.registrationFailed missing`);
}

assert(JSON.stringify(Object.keys(de.auth.register).sort()) === JSON.stringify(Object.keys(en.auth.register).sort()), "German and English registration keys must stay symmetric");
assert(!JSON.stringify(de.auth).toLowerCase().includes("terms") && !JSON.stringify(en.auth).toLowerCase().includes("terms"), "Auth content must not invent a terms URL or terms copy");

console.log("mobile auth registration regression passed");
