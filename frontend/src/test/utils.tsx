import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { Providers } from '@/app/providers';
import { routes } from '@/app/router';
import type { AuthSession, Task } from '@/api/types';

export type FakeRequest = { body: Record<string, unknown> | undefined; headers: Headers };
type Handler = (req: FakeRequest) => Response | Promise<Response>;

/** Simula `fetch`. Las claves son "MÉTODO /ruta" (sin el prefijo /api/v1); una ruta sin manejador falla la prueba. */
export function mockApi(overrides: Record<string, Handler>) {
  // Quien inicia sesión aterriza en /tasks: por defecto la lista llega vacía (una prueba puede sustituirla).
  const handlers: Record<string, Handler> = {
    'GET /tasks': noTasks,
    'GET /tags': () => json(200, { items: [], nextCursor: null }),
    ...overrides,
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace('/api/v1', '')}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Petición sin simular: ${key}`);
    return handler({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const empty = (status: number) => new Response(null, { status });

export const problem = (
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  json(
    status,
    { type: 'https://sh2do.app/problems/test', title: 'Error', status, code, detail, ...extra },
    headers,
  );

export const makeSession = (
  user: Partial<AuthSession['user']> = {},
  accessToken = 'token-1',
): AuthSession => ({
  accessToken,
  accessTokenExpiresIn: 900,
  user: {
    id: 1,
    displayName: 'Ana',
    email: 'ana@example.com',
    emailVerified: false,
    timezone: 'UTC',
    ...user,
  },
});

/** Respuesta de /auth/refresh cuando no hay cookie de sesión válida. */
export const noSession = () => problem(401, 'SESSION_INVALID', 'Sesión no válida.');

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, user: userEvent.setup() };
}

/** Respuesta de `GET /tasks` sin pendientes: las pruebas que aterrizan en la lista no necesitan más. */
export const noTasks = () => json(200, { items: [], nextCursor: null });

export const verifiedSession = () => json(200, makeSession({ emailVerified: true }));

export const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 7,
  title: 'Comprar pan',
  description: null,
  status: 'pending',
  priority: 'medium',
  tags: [],
  scheduledDate: null,
  scheduledTime: null,
  timezone: 'UTC',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

export const taskPage = (items: Task[], nextCursor: string | null = null) =>
  json(200, { items, nextCursor });
