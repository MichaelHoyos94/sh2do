import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  json,
  makeTask,
  mockApi,
  problem,
  renderApp,
  taskPage,
  verifiedSession,
} from '@/test/utils';

describe('TasksPage', () => {
  it('CA-04: muestra un estado de carga y luego los pendientes con fecha, estado y prioridad', async () => {
    let finish = (_response: Response) => {};
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () => new Promise<Response>((resolve) => (finish = resolve)),
    });
    renderApp('/tasks');

    expect(await screen.findByText('Cargando pendientes…')).toHaveAttribute('role', 'status');
    finish(
      taskPage([
        makeTask({
          id: 2,
          title: 'Pagar el recibo',
          scheduledDate: '2026-11-28',
          scheduledTime: '18:30',
          priority: 'high',
        }),
        makeTask({ id: 1, title: 'Llamar a Marta', status: 'in_progress', priority: 'low' }),
      ]),
    );

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Pagar el recibo' })).toHaveAttribute(
      'href',
      '/tasks/2',
    );
    expect(items[0]).toHaveTextContent('sáb, 28 nov 2026 · 18:30');
    expect(items[0]).toHaveTextContent('Pendiente');
    expect(items[0]).toHaveTextContent('Prioridad: Alta');
    expect(items[1]).toHaveTextContent('Sin fecha');
    expect(items[1]).toHaveTextContent('En progreso');
    expect(items[1]).toHaveTextContent('Prioridad: Baja');
    expect(screen.getByRole('heading', { name: 'Mis pendientes' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Nuevo pendiente' })).toHaveAttribute(
      'href',
      '/tasks/new',
    );
  });

  it('CA-04: sin pendientes muestra el estado vacío', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    renderApp('/tasks');

    expect(await screen.findByText('Aún no tienes pendientes')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('CA-04: ante un error muestra el mensaje y permite reintentar', async () => {
    let fail = true;
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () =>
        fail ? problem(500, 'INTERNAL_ERROR', 'Error interno.') : taskPage([makeTask()]),
    });
    const { user } = renderApp('/tasks');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('link', { name: 'Comprar pan' })).toBeInTheDocument();
  });

  it('CA-04: "Cargar más" pide la página siguiente con el cursor y se oculta al terminar', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () => taskPage([makeTask({ id: 2, title: 'Segundo' })], '2'),
      'GET /tasks?cursor=2': () => taskPage([makeTask({ id: 1, title: 'Primero' })]),
    });
    const { user } = renderApp('/tasks');

    await screen.findByRole('link', { name: 'Segundo' });
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByRole('link', { name: 'Primero' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Segundo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/tasks')).length).toBe(2);
  });

  it('un 401 persistente vuelve a /login', async () => {
    mockApi({
      'POST /auth/refresh': (() => {
        let calls = 0;
        return () =>
          ++calls === 1 ? verifiedSession() : problem(401, 'SESSION_INVALID', 'Sesión no válida.');
      })(),
      'GET /tasks': () =>
        json(401, { type: 'x', title: 'No', status: 401, code: 'UNAUTHENTICATED' }),
    });
    renderApp('/tasks');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  });
});
