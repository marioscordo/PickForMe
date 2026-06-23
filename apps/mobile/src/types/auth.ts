export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "dev"; email: string }
  | { status: "authenticated"; userId: string; email?: string };
