import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeTask, mockApi, problem, renderApp, verifiedSession } from '@/test/utils';

describe('TaskDetailPage', () => {
  it('CA-05: muestra todos los datos del pendiente, con la descripción y el botón Editar', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () =>
        json(
          200,
          makeTask({
            title: 'Pagar el recibo',
            description: 'Línea uno\nLínea dos',
            scheduledDate: '2026-11-28',
            scheduledTime: '18:30',
            priority: 'high',
            status: 'in_progress',
            timezone: 'America/Bogota',
          }),
        ),
    });
    renderApp('/tasks/7');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Pagar el recibo' })).toHaveFocus(),
    );
    expect(screen.getByText(/Línea uno/)).toHaveTextContent('Línea dos');
    expect(screen.getByText('sáb, 28 nov 2026 · 18:30')).toBeInTheDocument();
    // Una insignia y el botón marcado del selector de estado.
    expect(screen.getAllByText('En progreso')).toHaveLength(2);
    expect(screen.getByText('Prioridad: Alta')).toBeInTheDocument();
    expect(screen.getByText('America/Bogota')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/tasks/7/edit');
  });

  it('indica cuando no hay descripción ni fecha', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tasks/7': () => json(200, makeTask()) });
    renderApp('/tasks/7');

    expect(await screen.findByText('Sin descripción')).toBeInTheDocument();
    expect(screen.getByText('Sin fecha')).toBeInTheDocument();
  });

  it('CA-08: no ofrece ninguna forma de eliminar el pendiente', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tasks/7': () => json(200, makeTask()) });
    renderApp('/tasks/7');

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /eliminar|borrar/i })).not.toBeInTheDocument();
  });

  it('CA-07: un pendiente inexistente o ajeno (404) muestra "Este pendiente no existe" con enlace a la lista', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/99': () => problem(404, 'NOT_FOUND', 'Este pendiente no existe.'),
    });
    renderApp('/tasks/99');

    expect(
      await screen.findByRole('heading', { name: 'Este pendiente no existe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis pendientes' })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });

  it('CA-07: un id que no es un entero positivo se trata como inexistente sin llamar a la API', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    renderApp('/tasks/abc');

    expect(
      await screen.findByRole('heading', { name: 'Este pendiente no existe' }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/tasks/abc'))).toBe(false);
  });

  it('ante otro error muestra el mensaje', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks/7': () => problem(500, 'INTERNAL_ERROR', 'Error interno.'),
    });
    renderApp('/tasks/7');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
  });
});
