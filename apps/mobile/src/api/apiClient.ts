type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export class PickForMeApiError extends Error {
  code?: string;
  details?: unknown;
  status?: number;

  constructor(message: string, code?: string, details?: unknown, status?: number) {
    super(message);
    this.name = "PickForMeApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export async function apiPost<TResponse, TBody>(
  path: string,
  body: TBody,
  options: { onResponseStatus?: (status: number) => void; signal?: AbortSignal } = {}
): Promise<TResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body),
    signal: options.signal
  });
  options.onResponseStatus?.(response.status);

  const payload = (await response.json()) as ApiResponse<TResponse>;

  if (!payload.ok) {
    throw new PickForMeApiError(payload.error.message, payload.error.code, payload.error.details, response.status);
  }

  return payload.data;
}

import { env } from "../config/env";
import { getAuthHeaders } from "../services/authService";
