import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { empty, json, makeSession, mockApi, noSession, problem, renderApp } from '@/test/utils';

describe('VerifyEmailPage', () => {
  it('CA-04: verifica con el token una sola vez y funciona sin sesión', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/verify-email': () => json(200, { emailVerified: true }),
    });
    renderApp('/verify-email?token=abc123');

    expect(await screen.findByRole('heading', { name: 'Correo verificado' })).toBeInTheDocument();
    const verifyCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/verify-email'));
    expect(verifyCalls).toHaveLength(1);
    expect(JSON.parse(verifyCalls[0]![1]!.body as string)).toEqual({ token: 'abc123' });
  });

  it('CA-04: con sesión, tras verificar desaparece el aviso "Verifica tu correo"', async () => {
    mockApi({
      'POST /auth/refresh': () => json(200, makeSession()),
      'POST /auth/verify-email': () => json(200, { emailVerified: true }),
    });
    const { user } = renderApp('/verify-email?token=abc123');

    await user.click(await screen.findByRole('link', { name: 'Continuar' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByText('Verifica tu correo')).not.toBeInTheDocument();
  });

  it('CA-04: un enlace vencido permite reenviar el correo si hay sesión', async () => {
    mockApi({
      'POST /auth/refresh': () => json(200, makeSession()),
      'POST /auth/verify-email': () =>
        problem(400, 'VERIFICATION_TOKEN_EXPIRED', 'El enlace de verificación venció.'),
      'POST /auth/verification-email': () => empty(202),
    });
    const { user } = renderApp('/verify-email?token=viejo');

    expect(await screen.findByRole('heading', { name: 'El enlace venció' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Reenviar correo' }));

    expect(await screen.findByText(/Te enviamos un nuevo enlace/)).toBeInTheDocument();
  });

  it('CA-04: un enlace inválido sin sesión invita a iniciar sesión', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/verify-email': () => problem(400, 'VERIFICATION_TOKEN_INVALID', 'El enlace no es válido o ya se usó.'),
    });
    renderApp('/verify-email?token=malo');

    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('ya se usó');
    expect(await screen.findByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login');
  });

  it('sin token no llama a la API y explica el problema', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/verify-email');

    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Falta el código de verificación');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('VerifyEmailBanner', () => {
  const unverified = () => json(200, makeSession());

  it('CA-05: reenvía el correo y anuncia el resultado en una región aria-live', async () => {
    mockApi({ 'POST /auth/refresh': unverified, 'POST /auth/verification-email': () => empty(202) });
    const { user } = renderApp('/');
    await screen.findByText('Verifica tu correo');
    expect(screen.getByRole('region', { name: 'Verifica tu correo' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

    const status = await screen.findByText(/Te enviamos un nuevo enlace/);
    expect(status).toHaveAttribute('role', 'status');
  });

  it('CA-05: si el correo ya estaba verificado lo confirma', async () => {
    mockApi({
      'POST /auth/refresh': unverified,
      'POST /auth/verification-email': () => problem(409, 'EMAIL_ALREADY_VERIFIED', 'Tu correo ya está verificado.'),
    });
    const { user } = renderApp('/');
    await screen.findByText('Verifica tu correo');

    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Tu correo ya está verificado.');
    expect(screen.queryByRole('button', { name: 'Reenviar correo' })).not.toBeInTheDocument();
  });

  it('CA-05: muestra el límite de reenvíos (429)', async () => {
    mockApi({
      'POST /auth/refresh': unverified,
      'POST /auth/verification-email': () =>
        problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.', {}, { 'Retry-After': '3600' }),
    });
    const { user } = renderApp('/');
    await screen.findByText('Verifica tu correo');

    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

    expect(await screen.findByText(/Inténtalo de nuevo en 60 minutos/)).toBeInTheDocument();
  });
});
