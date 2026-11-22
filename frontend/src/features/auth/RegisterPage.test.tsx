import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeSession, mockApi, noSession, problem, renderApp } from '@/test/utils';

async function fillForm(
  user: ReturnType<typeof renderApp>['user'],
  overrides: Record<string, string> = {},
) {
  const values = {
    'Nombre visible': 'Ana',
    'Correo electrónico': 'ana@example.com',
    Contraseña: 'secreto123',
    'Confirma la contraseña': 'secreto123',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(label), value);
  }
  await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('RegisterPage', () => {
  it('CA-01: envía los datos con la zona horaria, inicia sesión y muestra el aviso de verificación', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/register': () => json(201, makeSession()),
    });
    const { user, router } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await fillForm(user);

    expect(await screen.findByRole('heading', { name: 'Mis pendientes' })).toBeInTheDocument();
    expect(screen.getByText('Verifica tu correo')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks');
    const registerCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/register'))!;
    expect(JSON.parse(registerCall[1]!.body as string)).toEqual({
      displayName: 'Ana',
      email: 'ana@example.com',
      password: 'secreto123',
      timezone: expect.any(String),
    });
  });

  it('CA-02: muestra errores por campo, no llama a la API y enfoca el primer error', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': noSession });
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Revisa los campos marcados: Nombre visible, Correo electrónico, Contraseña',
    );
    const name = screen.getByLabelText('Nombre visible');
    expect(name).toHaveAccessibleDescription(/entre 2 y 60/);
    expect(name).toHaveFocus();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription(
      /correo válido/,
    );
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/entre 8 y 128/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el refresh inicial
  });

  it('valida que la confirmación coincida con la contraseña', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await fillForm(user, { 'Confirma la contraseña': 'otra-cosa-1' });

    expect(screen.getByLabelText('Confirma la contraseña')).toHaveAccessibleDescription(
      'Las contraseñas no coinciden.',
    );
    expect(screen.getByLabelText('Confirma la contraseña')).toHaveFocus();
  });

  it('CA-02: muestra los 422 del servidor en su campo', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/register': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: [{ field: 'password', message: 'La contraseña es demasiado común.' }],
        }),
    });
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await fillForm(user);

    const password = await screen.findByLabelText('Contraseña');
    expect(password).toHaveAccessibleDescription(/demasiado común/);
    expect(password).toHaveFocus();
  });

  it('CA-03: ante un correo duplicado ofrece un enlace al inicio de sesión', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/register': () =>
        problem(409, 'EMAIL_ALREADY_REGISTERED', 'Ya existe una cuenta con este correo.'),
    });
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await fillForm(user);

    expect(await screen.findByText(/Ya existe una cuenta con este correo/)).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'Inicia sesión' })[0]!;
    expect(link).toHaveAttribute('href', '/login');
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
  });

  it('conserva el redirect en los enlaces al inicio de sesión', async () => {
    mockApi({ 'POST /auth/refresh': noSession });
    renderApp('/register?redirect=%2Fplanes');
    expect(await screen.findByRole('link', { name: 'Inicia sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fplanes',
    );
  });

  it('CA-13: muestra el mensaje del límite de registros (429)', async () => {
    mockApi({
      'POST /auth/refresh': noSession,
      'POST /auth/register': () =>
        problem(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos.', {}, { 'Retry-After': '1800' }),
    });
    const { user } = renderApp('/register');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });

    await fillForm(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Inténtalo de nuevo en 30 minutos');
  });
});
