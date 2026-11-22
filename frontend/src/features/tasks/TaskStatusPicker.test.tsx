import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeTask, mockApi, problem, renderApp, taskPage, verifiedSession } from '@/test/utils';

const isCall = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === `/api/v1${path}` && (init?.method ?? 'GET') === method,
  );

describe('TaskStatusPicker', () => {
  it('muestra un grupo "Estado" con los tres estados y el actual marcado', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, makeTask({ status: 'in_progress' })),
    });
    renderApp('/tasks/7');

    const group = await screen.findByRole('group', { name: 'Estado' });
    const buttons = group.querySelectorAll('button');
    expect([...buttons].map((b) => b.textContent)).toEqual([
      'Pendiente',
      '✓En progreso',
      'Completado',
    ]);
    expect(screen.getByRole('button', { name: 'En progreso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Completado' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('CA-01: pulsar "Completado" envía el PUT, queda marcado, anuncia "Estado actualizado" y la lista se invalida', async () => {
    let status: 'pending' | 'completed' = 'pending';
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () => taskPage([makeTask({ status })]),
      'GET /tasks/7': () => json(200, makeTask()),
      'PUT /tasks/7/status': () => {
        status = 'completed';
        return json(200, makeTask({ status, updatedAt: '2026-11-21T12:00:00.000Z' }));
      },
    });
    const { user, router } = renderApp('/tasks');
    await screen.findByText('Comprar pan');
    await act(() => router.navigate('/tasks/7'));
    await screen.findByRole('group', { name: 'Estado' });

    await user.click(screen.getByRole('button', { name: 'Completado' }));

    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Completado' })).toHaveFocus();
    const [[, init]] = isCall(fetchMock, 'PUT', '/tasks/7/status');
    expect(JSON.parse(init!.body as string)).toEqual({ status: 'completed' });

    // La lista quedó obsoleta: al volver a ella se pide de nuevo y muestra el estado nuevo.
    await user.click(screen.getByRole('link', { name: 'Volver a mis pendientes' }));
    expect(await screen.findByText('Completado')).toBeInTheDocument();
    expect(isCall(fetchMock, 'GET', '/tasks').length).toBeGreaterThanOrEqual(2);
  });

  it('deshabilita los botones y muestra "Guardando…" mientras guarda', async () => {
    let release!: () => void;
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, makeTask()),
      'PUT /tasks/7/status': () =>
        new Promise((resolve) => {
          release = () => resolve(json(200, makeTask({ status: 'in_progress' })));
        }),
    });
    const { user } = renderApp('/tasks/7');
    await screen.findByRole('group', { name: 'Estado' });

    await user.click(screen.getByRole('button', { name: 'En progreso' }));

    expect(await screen.findByText('Guardando…')).toBeInTheDocument();
    for (const name of ['Pendiente', 'En progreso', 'Completado']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    release();
    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'En progreso' })).toBeEnabled();
  });

  it('permite volver desde "Completado" a otro estado (transiciones libres)', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, makeTask({ status: 'completed' })),
      'PUT /tasks/7/status': (req) => json(200, makeTask({ status: req.body!.status as 'pending' })),
    });
    const { user } = renderApp('/tasks/7');
    await screen.findByRole('group', { name: 'Estado' });

    await user.click(screen.getByRole('button', { name: 'Pendiente' }));

    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('CA-04: pulsar el estado actual no llama a la API', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, makeTask({ status: 'in_progress' })),
    });
    const { user } = renderApp('/tasks/7');
    await screen.findByRole('group', { name: 'Estado' });

    await user.click(screen.getByRole('button', { name: 'En progreso' }));

    expect(isCall(fetchMock, 'PUT', '/tasks/7/status')).toHaveLength(0);
    expect(screen.queryByText('Estado actualizado')).not.toBeInTheDocument();
  });

  it('CA-05: si falla el guardado muestra el error y sigue marcado el estado anterior', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => json(200, makeTask({ status: 'pending' })),
      'PUT /tasks/7/status': () => problem(500, 'INTERNAL_ERROR', 'No pudimos guardar el estado.'),
    });
    const { user } = renderApp('/tasks/7');
    await screen.findByRole('group', { name: 'Estado' });

    await user.click(screen.getByRole('button', { name: 'Completado' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar el estado.');
    expect(screen.getByRole('button', { name: 'Pendiente' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Completado' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Completado' })).toBeEnabled();
    expect(screen.queryByText('Estado actualizado')).not.toBeInTheDocument();
  });
});
