import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { empty, json, makeSession, mockApi, noSession, problem, renderApp } from '@/test/utils';

const callsTo = (fetchMock: ReturnType<typeof mockApi>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix));

const expiredToken = () =>
  problem(
    400,
    'PASSWORD_RESET_TOKEN_EXPIRED',
    'El enlace de recuperación venció o ya se usó. Pide uno nuevo.',
  );

describe('ForgotPasswordPage', () => {
  it('CA-01 y CA-02: envía el correo y muestra el mensaje genérico, exista o no la cuenta', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/forgot-password': () => empty(202),
    });
    const { user } = renderApp('/forgot-password');

    await screen.findByRole('heading', { name: '¿Olvidaste tu contraseña?' });
    await user.type(screen.getByLabelText('Correo electrónico'), '  nadie@example.com ');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Si existe una cuenta con ese correo, te enviamos un enlace',
    );
    const [call] = callsTo(fetchMock, '/auth/forgot-password');
    expect(JSON.parse(call![1]!.body as string)).toEqual({ email: 'nadie@example.com' });
  });

  it('muestra el error del correo inválido sin llamar a la API y los 422 por campo', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/forgot-password': () =>
        problem(422, 'VALIDATION_ERROR', 'Datos inválidos.', {
          errors: [{ field: 'email', message: 'Correo no válido.' }],
        }),
    });
    const { user } = renderApp('/forgot-password');

    await screen.findByRole('heading', { name: '¿Olvidaste tu contraseña?' });
    await user.type(screen.getByLabelText('Correo electrónico'), 'sin-arroba');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
    expect(callsTo(fetchMock, '/auth/forgot-password')).toHaveLength(0);

    await user.clear(screen.getByLabelText('Correo electrónico'));
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText('Correo no válido.')).toBeInTheDocument();
  });

  it('CA-04: con 429 muestra cuántos minutos esperar', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/forgot-password': () =>
        problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.', {}, { 'Retry-After': '1800' }),
    });
    const { user } = renderApp('/forgot-password');

    await screen.findByRole('heading', { name: '¿Olvidaste tu contraseña?' });
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Inténtalo de nuevo en 30 minutos');
  });

  it('CA-10: el login enlaza a /forgot-password', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/login');
    expect(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('CA-10: con sesión, /forgot-password redirige a /', async () => {
    mockApi({ 'POST /auth/refresh': () => json(200, makeSession({ emailVerified: true })) });
    const { router } = renderApp('/forgot-password');

    expect(await screen.findByRole('heading', { name: 'Mis pendientes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks');
  });
});

describe('ResetPasswordPage', () => {
  async function fillAndSubmit(
    user: ReturnType<typeof renderApp>['user'],
    password: string,
    confirm: string,
  ) {
    await screen.findByRole('heading', { name: 'Elige una contraseña nueva' });
    await user.type(screen.getByLabelText('Contraseña nueva'), password);
    await user.type(screen.getByLabelText('Confirma la contraseña'), confirm);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  }

  it('CA-05: comprueba el enlace una sola vez, cambia la contraseña y va a /login con el aviso', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () => empty(204),
      'POST /auth/reset-password': () => empty(204),
    });
    const { user, router } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'nueva-clave-1', 'nueva-clave-1');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tu contraseña se cambió. Inicia sesión con la nueva.',
    );
    expect(callsTo(fetchMock, '/auth/reset-password/check')).toHaveLength(1);
    const [call] = callsTo(fetchMock, '/auth/reset-password');
    expect(JSON.parse(call![1]!.body as string)).toEqual({
      token: 'abc123',
      password: 'nueva-clave-1',
    });
  });

  it('CA-05: con sesión abierta, la cierra en local sin llamar a /auth/logout y llega al login', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': () => json(200, makeSession({ emailVerified: true })),
      'POST /auth/reset-password/check': () => empty(204),
      'POST /auth/reset-password': () => empty(204),
    });
    const { user, router } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'nueva-clave-1', 'nueva-clave-1');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.getByRole('status')).toHaveTextContent('Tu contraseña se cambió');
    expect(callsTo(fetchMock, '/auth/logout')).toHaveLength(0);
  });

  it('CA-06: valida longitud y confirmación por campo, con resumen y foco, sin llamar a la API', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () => empty(204),
    });
    const { user } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'corta', 'otra');

    expect(
      await screen.findByText('La contraseña debe tener entre 8 y 128 caracteres.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Revisa los campos marcados: Contraseña nueva, Confirma la contraseña.',
    );
    expect(screen.getByLabelText('Contraseña nueva')).toHaveFocus();
    expect(callsTo(fetchMock, '/auth/reset-password')).toHaveLength(0);
  });

  it('CA-06: la confirmación distinta se marca en su campo', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () => empty(204),
    });
    const { user } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'nueva-clave-1', 'nueva-clave-2');

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirma la contraseña')).toHaveFocus();
  });

  it('muestra el 422 del servidor en el campo de la contraseña', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () => empty(204),
      'POST /auth/reset-password': () =>
        problem(422, 'VALIDATION_ERROR', 'Datos inválidos.', {
          errors: [{ field: 'password', message: 'Contraseña no válida.' }],
        }),
    });
    const { user } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'nueva-clave-1', 'nueva-clave-1');

    expect(await screen.findByText('Contraseña no válida.')).toBeInTheDocument();
  });

  it('CA-07: un enlace vencido, usado o reemplazado muestra el mensaje y permite pedir otro', async () => {
    mockApi({ 'POST /auth/refresh': noSession, 'POST /auth/reset-password/check': expiredToken });
    renderApp('/reset-password?token=viejo');

    expect(
      await screen.findByRole('heading', { name: 'El enlace venció o ya se usó' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });

  it('CA-07: si el enlace se usa mientras se escribe, el cambio también muestra el mensaje', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () => empty(204),
      'POST /auth/reset-password': () =>
        problem(400, 'PASSWORD_RESET_TOKEN_INVALID', 'El enlace no es válido.'),
    });
    const { user } = renderApp('/reset-password?token=abc123');

    await fillAndSubmit(user, 'nueva-clave-1', 'nueva-clave-1');

    expect(
      await screen.findByRole('heading', { name: 'El enlace venció o ya se usó' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
  });

  it('sin token no llama a la API y ofrece pedir un enlace', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/reset-password');

    expect(
      await screen.findByRole('heading', { name: 'El enlace venció o ya se usó' }),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, '/auth/reset-password/check')).toHaveLength(0);
  });

  it('un error distinto de 400 al comprobar muestra el error con la opción de pedir otro enlace', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/reset-password/check': () =>
        problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.'),
    });
    renderApp('/reset-password?token=abc123');

    expect(
      await screen.findByRole('heading', { name: 'No pudimos comprobar el enlace' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Demasiados intentos');
  });
});
