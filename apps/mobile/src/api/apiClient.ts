import { getAuthHeaders } from "../services/authService";
import { env } from "../config/env";

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export async function apiPost<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as ApiResponse<TResponse>;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.data;
}
