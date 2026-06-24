type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export class PickForMeApiError extends Error {
  code?: string;
  details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "PickForMeApiError";
    this.code = code;
    this.details = details;
  }
}

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
    throw new PickForMeApiError(payload.error.message, payload.error.code, payload.error.details);
  }

  return payload.data;
}

import { env } from "../config/env";
import { getAuthHeaders } from "../services/authService";
