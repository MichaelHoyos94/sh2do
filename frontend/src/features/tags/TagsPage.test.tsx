import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Tag } from '@/api/types';
import { empty, json, mockApi, problem, renderApp, verifiedSession } from '@/test/utils';

const makeTag = (id: number, name: string): Tag => ({
  id,
  name,
  createdAt: '2026-11-20T10:00:00.000Z',
});
const tagPage = (items: Tag[], nextCursor: string | null = null) =>
  json(200, { items, nextCursor });

/** API con estado: GET devuelve `tags`; el resto de rutas las aporta cada prueba. */
function setup(initial: Tag[], extra: Parameters<typeof mockApi>[0] = {}) {
  const state = { tags: initial };
  const fetchMock = mockApi({
    'POST /auth/refresh': verifiedSession,
    'GET /tags': () => tagPage(state.tags),
    ...extra,
  });
  return { state, fetchMock };
}

const nameError = (detail: string, status: number, code: string) =>
  problem(status, code, detail, { errors: [{ field: 'name', message: detail }] });

describe('TagsPage', () => {
  it('CA-07: muestra carga, luego las etiquetas, y el enlace del menú lleva a la página', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    mockApi({ 'POST /auth/refresh': verifiedSession, 'GET /tags': () => pending });
    const { user } = renderApp('/tasks');

    await user.click(await screen.findByRole('link', { name: 'Etiquetas' }));
    expect(await screen.findByText('Cargando etiquetas…')).toHaveAttribute('role', 'status');
    finish(tagPage([makeTag(1, 'Casa'), makeTag(2, 'Trabajo')]));

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Casa');
    expect(screen.getByRole('heading', { name: 'Etiquetas' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Renombrar Trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Trabajo' })).toBeInTheDocument();
  });

  it('CA-07: sin etiquetas muestra el estado vacío', async () => {
    setup([]);
    renderApp('/tags');

    expect(await screen.findByText('Aún no tienes etiquetas.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('CA-07: ante un error muestra el mensaje y permite reintentar', async () => {
    let fail = true;
    mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () =>
        fail ? problem(500, 'INTERNAL_ERROR', 'Error interno.') : tagPage([makeTag(1, 'Casa')]),
    });
    const { user } = renderApp('/tags');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Casa')).toBeInTheDocument();
  });

  it('CA-07: "Cargar más" pide la siguiente página con el cursor', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': verifiedSession,
      'GET /tags': () => tagPage([makeTag(1, 'Casa')], 'c1'),
      'GET /tags?cursor=c1': () => tagPage([makeTag(2, 'Trabajo')]),
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText('Trabajo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tags?cursor=c1', expect.anything());
  });

  it('CA-01: crear añade la etiqueta a la lista y anuncia "Etiqueta creada"', async () => {
    const { state } = setup([], {
      'POST /tags': ({ body }) => {
        const tag = makeTag(5, String(body?.name));
        state.tags = [tag];
        return json(201, tag);
      },
    });
    const { user } = renderApp('/tags');

    await user.type(await screen.findByLabelText('Nueva etiqueta'), 'Casa');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Casa')).toBeInTheDocument();
    expect(await screen.findByText('Etiqueta creada')).toHaveAttribute('role', 'status');
    expect(screen.getByLabelText('Nueva etiqueta')).toHaveValue('');
  });

  it('CA-02: un 422 se muestra en el campo y conserva el texto', async () => {
    setup([], {
      'POST /tags': () => nameError('El nombre es obligatorio.', 422, 'VALIDATION_ERROR'),
    });
    const { user } = renderApp('/tags');

    await user.type(await screen.findByLabelText('Nueva etiqueta'), '   ');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const field = screen.getByLabelText('Nueva etiqueta');
    expect(await screen.findByText('El nombre es obligatorio.')).toHaveAttribute('role', 'alert');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('El nombre es obligatorio.');
    expect(field).toHaveValue('   ');
  });

  it('CA-03: un 409 TAG_NAME_TAKEN se muestra en el campo y conserva el texto', async () => {
    setup([makeTag(1, 'Trabajo')], {
      'POST /tags': () =>
        nameError('Ya tienes una etiqueta con ese nombre.', 409, 'TAG_NAME_TAKEN'),
    });
    const { user } = renderApp('/tags');

    await user.type(await screen.findByLabelText('Nueva etiqueta'), 'trabajo');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Ya tienes una etiqueta con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva etiqueta')).toHaveValue('trabajo');
  });

  it('CA-05: renombrar en línea enfoca y selecciona el texto, guarda y devuelve el foco', async () => {
    const { state } = setup([makeTag(1, 'Trabajo')], {
      'PATCH /tags/1': ({ body }) => {
        state.tags = [makeTag(1, String(body?.name))];
        return json(200, state.tags[0]);
      },
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Renombrar Trabajo' }));
    const field = screen.getByLabelText('Nuevo nombre para «Trabajo»');
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe('Trabajo'.length);

    await user.keyboard('Oficina');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Etiqueta renombrada')).toBeInTheDocument();
    const rename = await screen.findByRole('button', { name: 'Renombrar Oficina' });
    expect(rename).toHaveFocus();
  });

  it('CA-05: Escape cancela sin llamar a la API y devuelve el foco', async () => {
    const { fetchMock } = setup([makeTag(1, 'Trabajo')]);
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Renombrar Trabajo' }));
    await user.keyboard('x{Escape}');

    expect(screen.getByRole('button', { name: 'Renombrar Trabajo' })).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('CA-05: un 409 al renombrar se muestra en el campo y conserva el texto', async () => {
    setup([makeTag(1, 'Trabajo'), makeTag(2, 'Casa')], {
      'PATCH /tags/1': () =>
        nameError('Ya tienes una etiqueta con ese nombre.', 409, 'TAG_NAME_TAKEN'),
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Renombrar Trabajo' }));
    await user.keyboard('casa');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const field = screen.getByLabelText('Nuevo nombre para «Trabajo»');
    expect(await screen.findByText('Ya tienes una etiqueta con ese nombre.')).toBeInTheDocument();
    expect(field).toHaveValue('casa');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-06: eliminar pide confirmación; Cancelar no llama a la API', async () => {
    const { fetchMock } = setup([makeTag(1, 'Trabajo')]);
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Eliminar Trabajo' }));
    expect(
      screen.getByText(
        '¿Eliminar «Trabajo»? Se quitará de tus pendientes; los pendientes no se borran.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Eliminar Trabajo' })).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('CA-06: confirmar llama al DELETE, quita la etiqueta y lleva el foco al título de la lista', async () => {
    const { state } = setup([makeTag(1, 'Trabajo')], {
      'DELETE /tags/1': () => {
        state.tags = [];
        return empty(204);
      },
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Eliminar Trabajo' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Etiqueta eliminada')).toHaveAttribute('role', 'status');
    expect(await screen.findByText('Aún no tienes etiquetas.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis etiquetas' })).toHaveFocus();
  });

  it('CA-08: un 404 al eliminar muestra "Esta etiqueta no existe." y refresca la lista', async () => {
    const { state } = setup([makeTag(1, 'Trabajo')], {
      'DELETE /tags/1': () => {
        state.tags = [];
        return problem(404, 'NOT_FOUND', 'Esta etiqueta no existe.');
      },
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Eliminar Trabajo' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta etiqueta no existe.');
    expect(await screen.findByText('Aún no tienes etiquetas.')).toBeInTheDocument();
  });

  it('CA-08: un 404 al renombrar muestra "Esta etiqueta no existe." y refresca la lista', async () => {
    const { state } = setup([makeTag(1, 'Trabajo')], {
      'PATCH /tags/1': () => {
        state.tags = [];
        return problem(404, 'NOT_FOUND', 'Esta etiqueta no existe.');
      },
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Renombrar Trabajo' }));
    await user.keyboard('Otra');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta etiqueta no existe.');
    expect(await screen.findByText('Aún no tienes etiquetas.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis etiquetas' })).toHaveFocus();
  });

  it('vacía el aviso al empezar otra acción para que el mismo mensaje se vuelva a anunciar', async () => {
    let finish!: () => void;
    const { state } = setup([makeTag(1, 'Trabajo'), makeTag(2, 'Casa')], {
      'PATCH /tags/1': ({ body }) => {
        state.tags = [makeTag(1, String(body?.name)), makeTag(2, 'Casa')];
        return json(200, state.tags[0]);
      },
      'PATCH /tags/2': ({ body }) =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, makeTag(2, String(body?.name))));
        }),
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Renombrar Trabajo' }));
    await user.keyboard('Oficina');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Etiqueta renombrada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Renombrar Casa' }));
    await user.keyboard('Hogar');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.queryByText('Etiqueta renombrada')).not.toBeInTheDocument();

    finish();
    expect(await screen.findByText('Etiqueta renombrada')).toBeInTheDocument();
  });

  it('un error distinto al eliminar se muestra en la confirmación', async () => {
    setup([makeTag(1, 'Trabajo')], {
      'DELETE /tags/1': () => problem(500, 'INTERNAL_ERROR', 'Error interno.'),
    });
    const { user } = renderApp('/tags');

    await user.click(await screen.findByRole('button', { name: 'Eliminar Trabajo' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});
