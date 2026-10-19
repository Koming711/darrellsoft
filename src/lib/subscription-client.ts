"use client";

/**
 * Helper fetch untuk alur pendaftaran & langganan (port dari implementasi
 * standalone — disesuaikan dengan auth Darrell Soft yang sudah ada:
 * header x-user-id / x-user-role dari localStorage, bukan Bearer token).
 *
 * Melempar SubscriptionApiError dengan .status/.code/.fieldErrors agar halaman
 * bisa menampilkan pesan per input dari server.
 */

export type ApiFieldErrors = Record<string, string>;

function getAuthHeaders(): Record<string, string> {
  try {
    const authData = localStorage.getItem("auth");
    if (authData) {
      const parsed = JSON.parse(authData) as { id?: string; role?: string };
      const headers: Record<string, string> = {};
      if (parsed.id) headers["x-user-id"] = parsed.id;
      if (parsed.role) headers["x-user-role"] = parsed.role;
      return headers;
    }
  } catch {
    // ignore
  }
  return {};
}

export class SubscriptionApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: ApiFieldErrors;
  payload: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: ApiFieldErrors,
    payload: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.payload = payload;
  }
}

/** GET/POST/PUT/DELETE JSON ke API alur langganan. GET memakai no-store. */
export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  options?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = options ?? {};
  const method = (rest.method ?? (json !== undefined ? "POST" : "GET")).toUpperCase();

  const res = await fetch(url, {
    ...rest,
    method,
    headers: {
      ...getAuthHeaders(),
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: method === "GET" ? "no-store" : "default",
  });

  let payload: {
    ok?: boolean;
    message?: string;
    error?: string;
    code?: string;
    fieldErrors?: ApiFieldErrors;
  } = {};
  try {
    payload = await res.json();
  } catch {
    // respons bukan JSON
  }

  if (!res.ok || payload.ok === false) {
    throw new SubscriptionApiError(
      payload.error || payload.message || `Terjadi kesalahan (${res.status})`,
      res.status,
      payload.code,
      payload.fieldErrors,
      payload as Record<string, unknown>
    );
  }

  return payload as T;
}
