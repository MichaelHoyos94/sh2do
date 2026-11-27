import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, makeTask, mockApi, problem, renderApp, verifiedSession } from '@/test/utils';

const tag = (id: number, name: string) => ({ id, name, createdAt: '2026-11-20T10:00:00.000Z' });
const tagPage = (items: ReturnType<typeof tag>[], nextCursor: string | null = null) =>
  json(200, { items, nextCursor });
const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  JSON.parse(
    fetchMock.mock.calls.find(
      ([url, init]) =>
        (init?.method === method && url.endsWith('/tasks/7')) ||
        (init?.method === method && url.endsWith('/tasks')),
    )![1]!.body as string,
  );
const labels = (boxes: HTMLElement[]) => boxes.map((box) => box.parentElement?.textContent);

async function openNewForm() {
  const rendered = renderApp('/tasks/new');
  await screen.findByRole('heading', { name: 'Nuevo pendiente' });
  return rendered;
}

describe('prioridad en el formulario', () => {
  it('CA-01: al crear, "Media" viene marcada y las opciones son Baja, Media y Alta', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    await openNewForm();

    const group = screen.getByRole('group', { name: 'Prioridad' });
    expect(within(group).getByRole('radio', { name: 'Media' })).toBeChecked();
    expect(labels(within(group).getAllByRole('radio'))).toEqual(['Baja', 'Media', 'Alta']);
  });

  it('CA-02: un 422 en priority se asocia al grupo Prioridad y se anuncia', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'POST /tasks': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: [{ field: 'priority', message: 'Elige una prioridad válida.' }],
        }),
    });
    const { user } = await openNewForm();

    await user.type(screen.getByLabelText('Título'), 'Algo');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los campos marcados: Prioridad',
    );
    const group = screen.getByRole('group', { name: 'Prioridad' });
    expect(group).toHaveAccessibleDescription('Elige una prioridad válida.');
    expect(group).toHaveFocus();
  });
});

describe('etiquetas en el formulario', () => {
  it('CA-02 y CA-03: elegir Alta y marcar etiquetas envía priority y el conjunto de tagIds', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => tagPage([tag(3, 'trabajo'), tag(1, 'Casa'), tag(2, 'Zapatos')]),
      'POST /tasks': () => json(201, makeTask()),
      'GET /tasks/7': () => json(200, makeTask()),
    });
    const { user } = await openNewForm();

    const group = await screen.findByRole('group', { name: 'Etiquetas' });
    // Orden alfabético sin distinguir mayúsculas.
    expect(labels(within(group).getAllByRole('checkbox'))).toEqual(['Casa', 'trabajo', 'Zapatos']);
    await user.click(screen.getByRole('radio', { name: 'Alta' }));
    await user.click(screen.getByRole('checkbox', { name: 'Casa' }));
    await user.click(screen.getByRole('checkbox', { name: 'Zapatos' }));
    await user.click(screen.getByRole('checkbox', { name: 'Zapatos' }));
    await user.click(screen.getByRole('checkbox', { name: 'trabajo' }));
    await user.type(screen.getByLabelText('Título'), 'Comprar pan');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    const body = bodyOf(fetchMock, 'POST');
    expect(body.priority).toBe('high');
    expect([...body.tagIds].sort()).toEqual([1, 3]);
  });

  it('CA-04: con 20 etiquetas marcadas las demás se deshabilitan y aparece "Máximo 20 etiquetas"', async () => {
    const tags = Array.from({ length: 21 }, (_, i) =>
      tag(i + 1, `Etiqueta ${String(i + 1).padStart(2, '0')}`),
    );
    mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tags': () => tagPage(tags) });
    const { user } = await openNewForm();

    const boxes = await screen.findAllByRole('checkbox');
    for (const box of boxes.slice(0, 19)) await user.click(box);
    expect(screen.queryByText('Máximo 20 etiquetas')).not.toBeInTheDocument();
    await user.click(boxes[19]);

    expect(screen.getByText('Máximo 20 etiquetas')).toBeInTheDocument();
    expect(boxes[20]).toBeDisabled();
    expect(boxes[19]).toBeEnabled();
    await user.click(boxes[19]);
    expect(boxes[20]).toBeEnabled();
  });

  it('sin etiquetas muestra "Aún no tienes etiquetas." con enlace a /tags', async () => {
    mockApi({ 'POST /auth/refresh': verifiedSession });
    await openNewForm();

    expect(await screen.findByText(/Aún no tienes etiquetas\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear etiquetas' })).toHaveAttribute('href', '/tags');
  });

  it('ante un error al cargar las etiquetas lo indica sin bloquear el formulario', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => problem(500, 'INTERNAL_ERROR', 'Error interno.'),
    });
    await openNewForm();

    expect(await screen.findByText('No se pudieron cargar las etiquetas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear pendiente' })).toBeEnabled();
  });

  it('"Cargar más etiquetas" pide la página siguiente y se oculta al terminar', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => tagPage([tag(1, 'Casa')], 'c1'),
      'GET /tags?cursor=c1': () => tagPage([tag(2, 'Trabajo')]),
    });
    const { user } = await openNewForm();

    await user.click(await screen.findByRole('button', { name: 'Cargar más etiquetas' }));

    expect(await screen.findByRole('checkbox', { name: 'Trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Casa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más etiquetas' })).not.toBeInTheDocument();
  });

  it('CA-04: un 422 en tagIds se asocia al grupo Etiquetas, se anuncia y recibe el foco', async () => {
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => tagPage([tag(1, 'Casa')]),
      'POST /tasks': () =>
        problem(422, 'VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: [{ field: 'tagIds', message: 'Alguna de las etiquetas elegidas no existe.' }],
        }),
    });
    const { user } = await openNewForm();

    await user.click(await screen.findByRole('checkbox', { name: 'Casa' }));
    await user.type(screen.getByLabelText('Título'), 'Algo');
    await user.click(screen.getByRole('button', { name: 'Crear pendiente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los campos marcados: Etiquetas',
    );
    const group = screen.getByRole('group', { name: 'Etiquetas' });
    expect(group).toHaveAccessibleDescription('Alguna de las etiquetas elegidas no existe.');
    expect(group).toHaveFocus();
  });
});

describe('editar prioridad y etiquetas', () => {
  const task = makeTask({ priority: 'low', tags: [{ id: 1, name: 'Casa' }] });
  const setup = () =>
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => tagPage([tag(1, 'Casa'), tag(2, 'Trabajo')]),
      'GET /tasks/7': () => json(200, task),
      'PATCH /tasks/7': () => json(200, task),
    });

  it('CA-02: llega precargado y, sin tocarlos, no envía priority ni tagIds', async () => {
    const fetchMock = setup();
    const { user } = renderApp('/tasks/7/edit');

    expect(await screen.findByRole('radio', { name: 'Baja' })).toBeChecked();
    expect(await screen.findByRole('checkbox', { name: 'Casa' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Trabajo' })).not.toBeChecked();
    await user.type(screen.getByLabelText('Título'), ' y leche');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({ title: 'Comprar pan y leche' });
  });

  it('CA-03: cambiar la prioridad y el conjunto envía ambos; desmarcar todo envía []', async () => {
    const fetchMock = setup();
    const { user } = renderApp('/tasks/7/edit');

    await user.click(await screen.findByRole('radio', { name: 'Alta' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Casa' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({ priority: 'high', tagIds: [] });
  });

  it('CA-03: cambiar de etiqueta envía el conjunto completo', async () => {
    const fetchMock = setup();
    const { user } = renderApp('/tasks/7/edit');

    await user.click(await screen.findByRole('checkbox', { name: 'Trabajo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await screen.findByRole('heading', { name: 'Comprar pan' });
    expect(bodyOf(fetchMock, 'PATCH').tagIds.sort()).toEqual([1, 2]);
  });
});
