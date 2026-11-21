import type { AuthSession, Problem } from './types';

const BASE_URL = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: Problem['code'] | 'NETWORK_ERROR' | 'UNKNOWN';
  readonly fieldErrors: NonNullable<Problem['errors']>;
  readonly retryAfter: number | null;

  constructor(
    status: number,
    message: string,
    code: ApiError['code'] = 'UNKNOWN',
    fieldErrors: ApiError['fieldErrors'] = [],
    retryAfter: number | null = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryAfter = retryAfter;
  }
}

// El access token vive solo en memoria: nunca en localStorage ni en cookies.
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession> | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionLostHandler(handler: () => void) {
  onSessionLost = handler;
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryAfter = Number(res.headers.get('Retry-After')) || null;
  try {
    const problem = (await res.json()) as Partial<Problem>;
    return new ApiError(
      res.status,
      problem.detail ?? problem.title ?? 'Ocurrió un error inesperado.',
      problem.code,
      problem.errors,
      retryAfter,
    );
  } catch {
    return new ApiError(res.status, 'Ocurrió un error inesperado.', 'UNKNOWN', [], retryAfter);
  }
}

async function send(
  method: string,
  path: string,
  body: unknown,
  withToken: boolean,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (withToken && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'No se pudo conectar con el servidor. Revisa tu conexión.',
      'NETWORK_ERROR',
    );
  }
}

async function callRefresh(): Promise<AuthSession> {
  const res = await send('POST', '/auth/refresh', undefined, false);
  if (!res.ok) throw await toApiError(res);
  const session = (await res.json()) as AuthSession;
  accessToken = session.accessToken;
  return session;
}

/**
 * Renueva la sesión con la cookie de refresh. Las llamadas simultáneas de una pestaña comparten una sola petición,
 * y entre pestañas se serializan con un lock: la segunda envía la cookie ya rotada por la primera.
 */
export function refreshSession(): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight;
  const run = async () =>
    navigator.locks
      ? await navigator.locks.request('sh2do-refresh', callRefresh)
      : await callRefresh();
  const shared = run().finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = shared;
  return shared;
}

type RequestOptions = { body?: unknown; auth?: boolean };

/** `auth: true` envía el Bearer y, ante un 401, renueva la sesión y reintenta una sola vez. */
export async function request<T = void>(
  method: string,
  path: string,
  { body, auth = false }: RequestOptions = {},
): Promise<T> {
  let res = await send(method, path, body, auth);
  if (res.status === 401 && auth) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionLost();
      throw await toApiError(res);
    }
    res = await send(method, path, body, auth);
  }
  if (!res.ok) throw await toApiError(res);
  return res.status === 204 || res.status === 202 ? (undefined as T) : ((await res.json()) as T);
}

/** Mensaje en español para mostrar al usuario según el tipo de error. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  switch (error.status) {
    case 401:
      return error.message || 'Tu sesión no es válida. Inicia sesión de nuevo.';
    case 403:
      return 'No tienes permiso para hacer esto.';
    case 404:
      return 'No encontramos lo que buscas.';
    case 429:
      return error.retryAfter
        ? `Demasiados intentos. Inténtalo de nuevo en ${formatWait(error.retryAfter)}.`
        : 'Demasiados intentos. Inténtalo de nuevo más tarde.';
    default:
      return error.message;
  }
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}
