export const env = {
  apiUrl: process.env.EXPO_PUBLIC_PICKFORME_API_URL ?? "http://localhost:3000",
  devMode: process.env.EXPO_PUBLIC_PICKFORME_DEV_MODE !== "false",
  devEmail: process.env.EXPO_PUBLIC_PICKFORME_DEV_EMAIL ?? "mario.scordo@t-online.de",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
};
