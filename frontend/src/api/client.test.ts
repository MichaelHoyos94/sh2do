import { describe, expect, it, vi } from 'vitest';
import { empty, json, makeSession, mockApi, problem } from '@/test/utils';
import { ApiError, describeError, refreshSession, request, setAccessToken, setSessionLostHandler } from './client';

describe('request', () => {
  it('envía el access token en memoria como Bearer', async () => {
    const fetchMock = mockApi({ 'GET /users/me': () => json(200, { id: 1 }) });
    setAccessToken('abc');
    await request('GET', '/users/me', { auth: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer abc');
    expect(init?.credentials).toBe('same-origin');
  });

  it('ante un 401 renueva la sesión una sola vez, compartida entre peticiones simultáneas, y reintenta', async () => {
    const refresh = vi.fn(() => json(200, makeSession({}, 'new')));
    mockApi({
      'POST /auth/refresh': refresh,
      'GET /users/me': ({ headers }) =>
        headers.get('Authorization') === 'Bearer new' ? json(200, { id: 1 }) : problem(401, 'UNAUTHENTICATED', 'Vencido.'),
    });
    setAccessToken('old');

    const results = await Promise.all([
      request('GET', '/users/me', { auth: true }),
      request('GET', '/users/me', { auth: true }),
    ]);

    expect(results).toEqual([{ id: 1 }, { id: 1 }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('si el refresh falla, limpia la sesión, avisa y lanza el 401', async () => {
    mockApi({
      'POST /auth/refresh': () => problem(401, 'SESSION_INVALID', 'Sesión no válida.'),
      'GET /users/me': () => problem(401, 'UNAUTHENTICATED', 'Vencido.'),
    });
    const lost = vi.fn();
    setSessionLostHandler(lost);
    setAccessToken('old');

    await expect(request('GET', '/users/me', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('no intenta renovar la sesión en endpoints públicos (p. ej. credenciales incorrectas)', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => problem(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'),
    });
    await expect(request('POST', '/auth/login', { body: {} })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('convierte Problem Details en ApiError con errores por campo y Retry-After', async () => {
    mockApi({
      'POST /auth/register': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos.', { errors: [{ field: 'email', message: 'Inválido.' }] }),
      'POST /auth/login': () => problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.', {}, { 'Retry-After': '90' }),
    });
    const validation = await request('POST', '/auth/register', { body: {} }).catch((e: ApiError) => e);
    expect(validation).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      fieldErrors: [{ field: 'email', message: 'Inválido.' }],
    });
    const limited = await request('POST', '/auth/login', { body: {} }).catch((e: ApiError) => e);
    expect(limited).toMatchObject({ status: 429, retryAfter: 90 });
  });

  it('maneja respuestas sin cuerpo, errores que no son JSON y fallos de red', async () => {
    mockApi({
      'POST /auth/logout': () => empty(204),
      'GET /boom': () => new Response('<html>', { status: 500 }),
    });
    await expect(request('POST', '/auth/logout')).resolves.toBeUndefined();
    await expect(request('GET', '/boom')).rejects.toMatchObject({ status: 500, code: 'UNKNOWN' });

    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network')));
    await expect(request('GET', '/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('serializa el refresh entre pestañas con navigator.locks', async () => {
    const lockRequest = vi.fn(<T>(_name: string, callback: () => Promise<T>) => callback());
    Object.defineProperty(navigator, 'locks', { value: { request: lockRequest }, configurable: true });
    try {
      const refresh = vi.fn(() => json(200, makeSession({}, 'locked')));
      mockApi({ 'POST /auth/refresh': refresh });

      await Promise.all([refreshSession(), refreshSession()]);

      expect(lockRequest).toHaveBeenCalledTimes(1);
      expect(lockRequest.mock.calls[0]![0]).toBe('sh2do-refresh');
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('refreshSession guarda el token nuevo en memoria', async () => {
    mockApi({
      'POST /auth/refresh': () => json(200, makeSession({}, 'fresh')),
      'GET /users/me': ({ headers }) => json(200, { auth: headers.get('Authorization') }),
    });
    await refreshSession();
    await expect(request('GET', '/users/me', { auth: true })).resolves.toEqual({ auth: 'Bearer fresh' });
  });
});

describe('describeError', () => {
  const err = (status: number, message = 'Detalle del servidor.', retryAfter: number | null = null) =>
    new ApiError(status, message, 'UNKNOWN', [], retryAfter);

  it('muestra mensajes claros en español por código HTTP', () => {
    expect(describeError(err(401))).toBe('Detalle del servidor.');
    expect(describeError(err(409))).toBe('Detalle del servidor.');
    expect(describeError(err(429, '', 30))).toMatch(/30 segundos/);
    expect(describeError(err(429, '', 61))).toMatch(/2 minutos/);
    expect(describeError(err(429))).toMatch(/más tarde/);
    expect(describeError(new Error('x'))).toMatch(/inesperado/);
  });
});
