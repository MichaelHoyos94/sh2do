import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { empty, json, makeSession, mockApi, noSession, renderApp } from '@/test/utils';

const verifiedSession = () => json(200, makeSession({ emailVerified: true }));

describe('rutas y sesión', () => {
  it('CA-11: sin sesión, cualquier URL privada o inexistente redirige a /login?redirect=', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    const { router } = renderApp('/x');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/x');
  });

  it('CA-11: con sesión, una URL inexistente muestra la página 404, y /login y /register llevan a /', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    const { router } = renderApp('/x');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toHaveFocus();

    for (const path of ['/login', '/register']) {
      await router.navigate(path);
      await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'));
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Mis pendientes' })).toHaveFocus(),
      );
    }
  });

  it('CA-09: sin sesión, /tasks redirige a /login?redirect=/tasks', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    const { router } = renderApp('/tasks');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/tasks');
  });

  it('con sesión, la cabecera enlaza a "Pendientes"', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user, router } = renderApp('/tasks/new');
    await screen.findByRole('heading', { name: 'Nuevo pendiente' });

    await user.click(screen.getByRole('link', { name: 'Pendientes' }));

    expect(await screen.findByRole('heading', { name: 'Mis pendientes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks');
  });

  it('muestra un estado de carga accesible mientras se restaura la sesión', async () => {
    let finishRefresh = (_response: Response) => {};
    mockApi({
      'POST /auth/refresh': () => new Promise<Response>((resolve) => (finishRefresh = resolve)),
    });
    renderApp('/');

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando');

    // Se libera el refresh pendiente para no contaminar las demás pruebas.
    finishRefresh(noSession());
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  });

  it('CA-10: al cargar con una cookie válida se restaura la sesión sin pedir credenciales', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Mis pendientes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks');
    expect(screen.queryByText('Verifica tu correo')).not.toBeInTheDocument();
  });

  it('CA-09: "Cerrar sesión" revoca la sesión, la limpia y lleva a /login', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'POST /auth/logout': () => empty(204),
    });
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Mis pendientes' });

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url.endsWith('/auth/logout') && init?.method === 'POST',
      ),
    ).toBe(true);
  });
});
