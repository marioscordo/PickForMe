const explicitDevMode = process.env.EXPO_PUBLIC_PICKFORME_DEV_MODE;
const apiUrl = process.env.EXPO_PUBLIC_PICKFORME_API_URL ?? "http://localhost:3000";
const localApiUrl = isLocalApiUrl(apiUrl);
const defaultDevMode = process.env.NODE_ENV !== "production";
const defaultDevEmail = "dev@pickforme.local";

export const env = {
  apiUrl,
  devMode: localApiUrl || (explicitDevMode ? explicitDevMode === "true" : defaultDevMode),
  devEmail: process.env.EXPO_PUBLIC_PICKFORME_DEV_EMAIL ?? defaultDevEmail,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
};

function isLocalApiUrl(value: string) {
  try {
    const { hostname, protocol } = new URL(value);

    return protocol === "http:" && (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.2") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.")
    );
  } catch {
    return false;
  }
}
