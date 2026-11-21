import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeSession, mockApi, noSession, problem, renderApp } from '@/test/utils';

async function submit(user: ReturnType<typeof renderApp>['user'], password = 'secreto123') {
  await screen.findByRole('heading', { name: 'Inicia sesión' });
  await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

const loginOk = () => json(200, makeSession({ emailVerified: true }));

describe('LoginPage', () => {
  it('CA-06: inicia sesión y vuelve a la ruta interna indicada en redirect', async () => {
    mockApi({ 'POST /auth/refresh': noSession, 'POST /auth/login': loginOk });
    const { user, router } = renderApp('/login?redirect=%2Fplanes%2F3');

    await submit(user);

    await screen.findByRole('heading', { name: 'Página no encontrada' }); // /planes/3 aún no existe: pasó por el guard
    expect(router.state.location.pathname).toBe('/planes/3');
  });

  it.each(['https://evil.com', '//evil.com'])('CA-06: rechaza el redirect externo %s y va a /', async (redirect) => {
    mockApi({ 'POST /auth/refresh': noSession, 'POST /auth/login': loginOk });
    const { user, router } = renderApp(`/login?redirect=${encodeURIComponent(redirect)}`);

    await submit(user);

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('CA-06: un usuario sin verificar puede entrar', async () => {
    mockApi({ 'POST /auth/refresh': noSession, 'POST /auth/login': () => json(200, makeSession()) });
    const { user } = renderApp('/login');

    await submit(user);

    expect(await screen.findByText('Verifica tu correo')).toBeInTheDocument();
  });

  it('CA-07: muestra el mensaje genérico de credenciales incorrectas y se queda en el login', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/login': () => problem(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'),
    });
    const { user, router } = renderApp('/login');

    await submit(user, 'mala-clave');

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('CA-08: muestra el mensaje del límite de intentos (429)', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/login': () => problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.', {}, { 'Retry-After': '45' }),
    });
    const { user } = renderApp('/login');

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Inténtalo de nuevo en 45 segundos');
  });

  it('conserva el redirect válido en el enlace al registro y descarta el externo', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/login?redirect=%2Fplanes');
    expect(await screen.findByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/register?redirect=%2Fplanes');
  });

  it('descarta un redirect externo en el enlace al registro', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/login?redirect=%2F%2Fevil.com');
    expect(await screen.findByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/register');
  });

  it('pide correo y contraseña antes de llamar a la API, enfocando el primer error', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': noSession });
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Inicia sesión' });

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos marcados: Correo electrónico, Contraseña.');
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Escribe tu contraseña.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
