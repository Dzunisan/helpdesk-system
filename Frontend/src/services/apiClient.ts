import axios, { AxiosError } from "axios";
import type { ApiErrorBody } from "@/types/api";

/**
 * The one axios instance for the Sprint 1 clients: base URL from VITE_API_URL, the httpOnly
 * "session" cookie on every request (withCredentials), and a 401 handler for expired sessions
 * and deactivated users (briefing S1: "A deactivated user's next request returns 401").
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

/** An API failure with the HTTP status and the server's readable message */
export class ApiError extends Error {
  /** 0 when the server could not be reached */
  readonly status: number;
  readonly errors: string[];
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: Partial<ApiErrorBody> | undefined, fallback: string, cause?: unknown) {
    const errors = body?.errors ?? [];
    super(body?.message && body.message !== "Validation failed" ? body.message : errors.join(" ") || body?.message || fallback, {
      cause,
    });
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.fieldErrors = body?.field_errors ?? {};
  }

  get isNotFound() {
    return this.status === 404;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
}

/** Any thrown value -> ApiError, so pages can switch on `status` (404 "Not found", 409 refresh...) */
export function toApiError(error: unknown, fallback = "Something went wrong. Please try again."): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    if (!error.response) return new ApiError(0, undefined, "Can't reach the server. Check your connection and try again.", error);
    return new ApiError(error.response.status, error.response.data as ApiErrorBody | undefined, fallback, error);
  }
  return new ApiError(0, undefined, error instanceof Error ? error.message : fallback, error);
}

/** Calls `request`, returns its data, and turns any failure into an ApiError */
export async function call<T>(request: () => Promise<{ data: T }>, fallback?: string): Promise<T> {
  try {
    return (await request()).data;
  } catch (error) {
    throw toApiError(error, fallback);
  }
}

// ---- 401 handling ----------------------------------------------------------------------------

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** AuthContext registers this: clear the user so ProtectedRoute sends them to sign in */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

// A wrong password (login) or "not signed in yet" (me) is a normal answer, not an expired session
const AUTH_PROBES = ["/auth/login", "/auth/me", "/auth/change-password"];

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      const url = error.config?.url ?? "";
      if (!AUTH_PROBES.some((probe) => url.includes(probe))) onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);
