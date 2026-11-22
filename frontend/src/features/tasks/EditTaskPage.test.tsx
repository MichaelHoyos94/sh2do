import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeTask, mockApi, problem, renderApp, verifiedSession } from '@/test/utils';

const scheduled = makeTask({
  description: 'Integral',
  scheduledDate: '2026-11-28',
  scheduledTime: '18:30',
});

const patchBody = (fetchMock: ReturnType<typeof mockApi>) => {
  const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
  return JSON.parse(patch[1]!.body as string);
};

describe('EditTaskPage', () => {
  it('CA-06: el formulario llega precargado y al guardar solo envía lo que cambió y navega al detalle', async () => {
    let saved = scheduled;
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, saved),
      'PATCH /tasks/7': (req) => {
        saved = { ...saved, ...req.body };
        return json(200, saved);
      },
    });
    const { user, router } = renderApp('/tasks/7/edit');

    const title = await screen.findByLabelText('Título');
    expect(title).toHaveValue('Comprar pan');
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Integral');
    expect(screen.getByLabelText('Fecha (opcional)')).toHaveValue('2026-11-28');
    expect(screen.getByLabelText('Hora (opcional)')).toHaveValue('18:30');

    await user.clear(title);
    await user.type(title, 'Comprar pan y leche');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('heading', { name: 'Comprar pan y leche' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks/7');
    expect(patchBody(fetchMock)).toEqual({ title: 'Comprar pan y leche' });
  });

  it('CA-06: quitar la fecha y la descripción envía null para borrarlas', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, scheduled),
      'PATCH /tasks/7': () => json(200, makeTask()),
    });
    const { user } = renderApp('/tasks/7/edit');

    await user.clear(await screen.findByLabelText('Fecha (opcional)'));
    await user.clear(screen.getByLabelText('Descripción (opcional)'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(patchBody(fetchMock)).toEqual({
      description: null,
      scheduledDate: null,
      scheduledTime: null,
    });
  });

  it('CA-02: muestra por campo el 422 del servidor al editar', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, scheduled),
      'PATCH /tasks/7': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: [{ field: 'scheduledDate', message: 'La fecha no es válida.' }],
        }),
    });
    const { user } = renderApp('/tasks/7/edit');

    await user.type(await screen.findByLabelText('Título'), '!');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Fecha (opcional)')).toHaveAccessibleDescription(
      'La fecha no es válida.',
    );
  });

  it('CA-07: editar un pendiente inexistente o ajeno muestra "Este pendiente no existe"', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/99': () => problem(404, 'NOT_FOUND', 'Este pendiente no existe.'),
    });
    renderApp('/tasks/99/edit');

    expect(
      await screen.findByRole('heading', { name: 'Este pendiente no existe' }),
    ).toBeInTheDocument();
  });

  it('ante otro error al cargar muestra el mensaje', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => problem(500, 'INTERNAL_ERROR', 'Error interno.'),
    });
    renderApp('/tasks/7/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
  });
});
