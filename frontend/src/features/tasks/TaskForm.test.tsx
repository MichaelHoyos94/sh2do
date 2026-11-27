import { fireEvent, screen } from '@testing-library/react';
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

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, suffix: string) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => url.endsWith(suffix) && init?.method === method,
  )!;
  return JSON.parse(call[1]!.body as string);
};

async function openNewForm() {
  const rendered = renderApp('/tasks/new');
  await screen.findByRole('heading', { name: 'Nuevo pendiente' });
  return rendered;
}

describe('crear un pendiente', () => {
  it('CA-01: guarda con todos los datos, navega al detalle y deja la lista por refrescar', async () => {
    let listCalls = 0;
    const created = makeTask({
      description: 'Integral',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tasks': () => {
        listCalls += 1;
        return taskPage(listCalls === 1 ? [] : [created]);
      },
      'POST /tasks': () => json(201, created, { Location: '/api/v1/tasks/7' }),
      'GET /tasks/7': () => json(200, created),
    });
    const { user, router } = renderApp('/tasks');
    await screen.findByText('Aún no tienes pendientes');

    await user.click(screen.getByRole('link', { name: 'Nuevo pendiente' }));
    await user.type(await screen.findByLabelText('Título'), '  Comprar pan  ');
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Integral');
    await user.type(screen.getByLabelText('Fecha (opcional)'), '2026-11-28');
    await user.type(screen.getByLabelText('Hora (opcional)'), '18:30');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(await screen.findByRole('heading', { name: 'Comprar pan' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks/7');
    expect(bodyOf(fetchMock, 'POST', '/tasks')).toEqual({
      title: 'Comprar pan',
      description: 'Integral',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
      priority: 'medium',
      tagIds: [],
    });

    await user.click(screen.getByRole('link', { name: 'Volver a mis pendientes' }));
    expect(await screen.findByRole('link', { name: 'Comprar pan' })).toBeInTheDocument();
    expect(listCalls).toBe(2);
  });

  it('CA-03: se puede crear sin fecha ni hora', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'POST /tasks': () => json(201, makeTask()),
      'GET /tasks/7': () => json(200, makeTask()),
    });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), 'Comprar pan');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(bodyOf(fetchMock, 'POST', '/tasks')).toEqual({
      title: 'Comprar pan',
      description: null,
      scheduledDate: null,
      scheduledTime: null,
      priority: 'medium',
      tagIds: [],
    });
  });

  it('CA-02: sin título muestra el error en el campo, lo enfoca y no llama a la API', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), '   ');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos marcados: Título');
    const title = screen.getByLabelText('Título');
    expect(title).toHaveAccessibleDescription('El título es obligatorio.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2); // refresh inicial y etiquetas
  });

  it('CA-02: un título de más de 200 caracteres no se envía', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user } = await openNewForm();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'a'.repeat(201) } });
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription(/200 caracteres/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // refresh inicial y etiquetas
  });

  it('CA-02: una descripción de más de 5000 caracteres no se envía', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), 'Algo');
    fireEvent.change(screen.getByLabelText('Descripción (opcional)'), {
      target: { value: 'a'.repeat(5001) },
    });
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(screen.getByLabelText('Descripción (opcional)')).toHaveAccessibleDescription(
      /5000 caracteres/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // refresh inicial y etiquetas
  });

  it('CA-02: muestra por campo el 422 del servidor', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'POST /tasks': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: [{ field: 'title', message: 'El título es obligatorio.' }],
        }),
    });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), 'Algo');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los campos marcados: Título',
    );
    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription(
      'El título es obligatorio.',
    );
    expect(screen.getByLabelText('Título')).toHaveFocus();
  });

  it('muestra en un aviso general cualquier otro error al guardar', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'POST /tasks': () => problem(500, 'INTERNAL_ERROR', 'Error interno.'),
    });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), 'Algo');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
    expect(screen.getByRole('button', { name: 'Crear pendiente' })).toBeEnabled();
  });

  it('CA-03: la hora está deshabilitada sin fecha, con una indicación, y se vacía al quitar la fecha', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user } = await openNewForm();
    const time = screen.getByLabelText('Hora (opcional)');
    const date = screen.getByLabelText('Fecha (opcional)');

    expect(time).toBeDisabled();
    expect(time).toHaveAccessibleDescription('Elige una fecha para poder poner la hora.');

    await user.type(date, '2026-11-28');
    expect(time).toBeEnabled();
    await user.type(time, '18:30');
    expect(time).toHaveValue('18:30');

    await user.clear(date);
    expect(time).toBeDisabled();
    expect(time).toHaveValue('');
  });

  it('CA-03: una fecha incompleta o inválida muestra el error en Fecha y no llama a la API', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': verifiedSession });
    const { user } = await openNewForm();
    const date = screen.getByLabelText('Fecha (opcional)');
    // jsdom no simula fechas a medio escribir: el navegador deja value '' y marca badInput.
    Object.defineProperty(date, 'validity', { value: { badInput: true } });

    await user.type(screen.getByLabelText('Título'), 'Comprar pan');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos marcados: Fecha');
    expect(date).toHaveAccessibleDescription('Escribe una fecha válida o déjala vacía.');
    expect(date).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2); // refresh inicial y etiquetas
  });
});
