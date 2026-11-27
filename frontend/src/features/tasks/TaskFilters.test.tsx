import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeTask, mockApi, renderApp, taskPage, verifiedSession } from '@/test/utils';

const tag = (id: number, name: string) => ({ id, name, createdAt: '2026-11-20T10:00:00.000Z' });
const withTags = () => json(200, { items: [tag(3, 'Casa'), tag(7, 'Trabajo')], nextCursor: null });
const listCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/v1/tasks'));

describe('filtros de Mis pendientes', () => {
  it('muestra tres grupos de chips y "Limpiar filtros" solo con algún chip activo', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tags': withTags });
    const { user } = renderApp('/tasks');

    for (const name of ['Estado', 'Prioridad', 'Etiquetas']) {
      expect(await screen.findByRole('group', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    const priority = screen.getByRole('group', { name: 'Prioridad' });
    expect(within(priority).getByRole('button', { name: 'Alta' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(within(priority).getByRole('button', { name: 'Alta' }));
    expect(within(priority).getByRole('button', { name: 'Alta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('el grupo Etiquetas no aparece si el usuario no tiene etiquetas', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    renderApp('/tasks');

    await screen.findByRole('group', { name: 'Estado' });
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).not.toBeInTheDocument();
  });

  it('CA-05: dos chips de un grupo piden la API con ambos valores', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user, router } = renderApp('/tasks');

    await user.click(await screen.findByRole('button', { name: 'Pendiente' }));
    await user.click(screen.getByRole('button', { name: 'Completado' }));

    expect(router.state.location.search).toBe('?status=pending%2Ccompleted');
    expect(listCalls(fetchMock)).toContain('/api/v1/tasks?status=pending,completed');
  });

  it('CA-06: chips de varios grupos se combinan en la petición', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tags': withTags });
    const { user } = renderApp('/tasks');

    await user.click(await screen.findByRole('button', { name: 'En progreso' }));
    await user.click(screen.getByRole('button', { name: 'Alta' }));
    await user.click(screen.getByRole('button', { name: 'Baja' }));
    await user.click(await screen.findByRole('button', { name: 'Trabajo' }));
    await user.click(screen.getByRole('button', { name: 'Casa' }));

    expect(listCalls(fetchMock)).toContain(
      '/api/v1/tasks?status=in_progress&priority=low,high&tagIds=3,7',
    );
  });

  it('CA-06: la página siguiente conserva los filtros junto al cursor', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks?priority=high': () => taskPage([makeTask({ id: 2 })], '2'),
      'GET /tasks?priority=high&cursor=2': () => taskPage([makeTask({ id: 1, title: 'Otro' })]),
    });
    const { user } = renderApp('/tasks?priority=high');

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByRole('link', { name: 'Otro' })).toBeInTheDocument();
    expect(listCalls(fetchMock)).toContain('/api/v1/tasks?priority=high&cursor=2');
  });

  it('CA-08: renderizar /tasks?priority=high deja el chip activo y filtra; ignora valores desconocidos', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks?priority=high': () => taskPage([makeTask({ priority: 'high' })]),
    });
    renderApp('/tasks?priority=high,urgente&status=nada&tagIds=x,0');

    expect(await screen.findByRole('link', { name: 'Comprar pan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alta' })).toHaveAttribute('aria-pressed', 'true');
    expect(listCalls(fetchMock)).toEqual(['/api/v1/tasks?priority=high']);
  });

  it('CA-08: "Limpiar filtros" quita los parámetros de la URL y vuelve a pedir la lista completa', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks?priority=high': () => taskPage([makeTask()]),
    });
    const { user, router } = renderApp('/tasks?priority=high');

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    expect(listCalls(fetchMock)).toContain('/api/v1/tasks');
    expect(screen.getByRole('button', { name: 'Alta' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('R-10: "Volver a mis pendientes" desde el detalle conserva los filtros', async () => {
    const task = makeTask({ id: 1, priority: 'high' });
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks?priority=high': () => taskPage([task]),
      'GET /tasks/1': () => json(200, task),
    });
    const { user, router } = renderApp('/tasks?priority=high');

    await user.click(await screen.findByRole('link', { name: 'Comprar pan' }));
    await user.click(await screen.findByRole('link', { name: 'Volver a mis pendientes' }));

    expect(router.state.location.search).toBe('?priority=high');
    expect(await screen.findByRole('button', { name: 'Alta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('CA-09: con filtros y sin resultados muestra el vacío con filtros y permite limpiarlos', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks?status=completed': () => taskPage([]),
    });
    const { user, router } = renderApp('/tasks?status=completed');

    const message = await screen.findByText('Ningún pendiente coincide con los filtros.');
    expect(screen.queryByText('Aún no tienes pendientes')).not.toBeInTheDocument();
    await user.click(
      within(message.parentElement!).getByRole('button', { name: 'Limpiar filtros' }),
    );

    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('Aún no tienes pendientes')).toBeInTheDocument();
  });

  it('CA-03: la lista muestra las etiquetas de cada pendiente en una lista "Etiquetas"', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () =>
        taskPage([
          makeTask({
            id: 2,
            tags: [
              { id: 3, name: 'Casa' },
              { id: 7, name: 'Trabajo' },
            ],
          }),
          makeTask({ id: 1, title: 'Sin etiquetas' }),
        ]),
    });
    renderApp('/tasks');

    const tags = await screen.findByRole('list', { name: 'Etiquetas' });
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Casa', 'Trabajo']);
    expect(screen.getAllByRole('list', { name: 'Etiquetas' })).toHaveLength(1);
  });
});
