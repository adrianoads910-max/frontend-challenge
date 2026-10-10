import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { ApiErrorBody, type ErrorCode } from "@/api/contracts";
import { mocksReady } from "./mocks-ready";
import { sessionStore } from "./session";

/*
 * Single Axios instance for every REST call. Responsibilities:
 *  - attach the bearer token and the guest cart id;
 *  - enforce a timeout (the "order-timeout" scenario relies on it);
 *  - turn every failure into an ApiError with a stable `code`, so UI and retry policies never
 *    parse messages;
 *  - broadcast session expiry (401 SESSION_EXPIRED / UNAUTHENTICATED on an authenticated call).
 */

export const REQUEST_TIMEOUT_MS = 8_000;
const CART_KEY = "kurio.cartId";

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "TIMEOUT" | "CANCELLED";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: unknown;

  constructor(status: number, code: ClientErrorCode, message: string, fields?: Record<string, string>, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }

  /** Safe to retry automatically: nothing was applied, or the call is idempotent. */
  get transient(): boolean {
    return this.code === "TRANSIENT" || this.code === "NETWORK_ERROR" || this.code === "TIMEOUT" || this.status >= 500;
  }
}

export function guestCartId(): string {
  let id = localStorage.getItem(CART_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CART_KEY, id);
  }
  return id;
}

export function resetGuestCartId() {
  localStorage.removeItem(CART_KEY);
}

type ExpiryListener = (reason: "expired") => void;
const expiryListeners = new Set<ExpiryListener>();
export const onSessionExpired = (l: ExpiryListener) => {
  expiryListeners.add(l);
  return () => {
    expiryListeners.delete(l);
  };
};

export const http = axios.create({ baseURL: "/api", timeout: REQUEST_TIMEOUT_MS });

http.interceptors.request.use(async (config) => {
  await mocksReady;
  const token = sessionStore.token();
  if (token && !config.headers.has("Authorization")) config.headers.set("Authorization", `Bearer ${token}`);
  config.headers.set("X-Cart-Id", guestCartId());
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    const sentToken = error instanceof AxiosError ? String(error.config?.headers?.Authorization ?? "") : "";
    if (
      (apiError.code === "SESSION_EXPIRED" || apiError.code === "UNAUTHENTICATED") &&
      sentToken &&
      sentToken === `Bearer ${sessionStore.token()}`
    ) {
      // Only the session that made the call may be expired by it (ignores late responses of a
      // previous user).
      for (const l of expiryListeners) l("expired");
    }
    return Promise.reject(apiError);
  },
);

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError(0, "CANCELLED", "Requisição cancelada");
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError(0, "TIMEOUT", "O servidor demorou para responder.");
    }
    if (!error.response) return new ApiError(0, "NETWORK_ERROR", "Sem conexão com o servidor.");
    const parsed = ApiErrorBody.safeParse(error.response.data);
    if (parsed.success) {
      const e = parsed.data.error;
      return new ApiError(error.response.status, e.code, e.message, e.fields, e.details);
    }
    return new ApiError(error.response.status, error.response.status >= 500 ? "INTERNAL" : "VALIDATION_ERROR", "Erro inesperado do servidor.");
  }
  return new ApiError(0, "INTERNAL", error instanceof Error ? error.message : "Erro inesperado");
}

/** Typed request helper: validates the response against its contract. */
export async function request<T>(
  config: AxiosRequestConfig,
  schema: { parse: (data: unknown) => T },
): Promise<T> {
  const response = await http.request(config);
  return schema.parse(response.data);
}
