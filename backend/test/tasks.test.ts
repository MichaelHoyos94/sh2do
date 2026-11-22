import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import { bearer, http, registerUser } from './helpers.js';

const TASKS = '/api/v1/tasks';

let token: string;
let userId: number;
let otherToken: string;

beforeEach(async () => {
  const ana = await registerUser();
  token = ana.accessToken;
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })).id;
  otherToken = (await registerUser({ email: 'beto@example.com', displayName: 'Beto' })).accessToken;
});

const create = (body: Record<string, unknown>, as = token) =>
  http().post(TASKS).set(bearer(as)).send(body);

/** Siembra un pendiente directamente en la BD, con su ocurrencia 0. */
async function seedTask(owner: number, title: string) {
  return prisma.task.create({
    data: {
      userId: owner,
      title,
      occurrences: { create: { sequenceNo: 0, timezone: 'America/Bogota' } },
    },
  });
}

const fieldErrors = (res: { body: { errors?: { field: string }[] } }) =>
  (res.body.errors ?? []).map((e) => e.field);

describe('POST /tasks', () => {
  it('CA-01: creates a pending, medium-priority task with its occurrence 0 in the user timezone', async () => {
    const res = await create({ title: '  Comprar pan  ', description: 'Integral' });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`${TASKS}/${res.body.id}`);
    expect(res.body).toMatchObject({
      title: 'Comprar pan',
      description: 'Integral',
      status: 'pending',
      priority: 'medium',
      scheduledDate: null,
      scheduledTime: null,
      timezone: 'America/Bogota',
    });
    const occurrences = await prisma.taskOccurrence.findMany({ where: { taskId: res.body.id } });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      sequenceNo: 0,
      status: 'pending',
      scheduledAtUtc: null,
    });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: res.body.id } })).userId).toBe(
      userId,
    );
  });

  it.each([
    ['is missing', {}],
    ['is blank', { title: '   ' }],
    ['is longer than 200 characters', { title: 'x'.repeat(201) }],
  ])('CA-02: rejects a title that %s and creates nothing', async (_label, body) => {
    const res = await create(body);

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(fieldErrors(res)).toEqual(['title']);
    expect(await prisma.task.count()).toBe(0);
  });

  it('CA-03: accepts no date, a date without time, and a date with time', async () => {
    const none = await create({ title: 'Sin fecha' });
    const dateOnly = await create({ title: 'Solo fecha', scheduledDate: '2026-11-28' });
    const both = await create({
      title: 'Fecha y hora',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });

    expect([none.status, dateOnly.status, both.status]).toEqual([201, 201, 201]);
    expect(dateOnly.body).toMatchObject({ scheduledDate: '2026-11-28', scheduledTime: null });
    expect(both.body).toMatchObject({ scheduledDate: '2026-11-28', scheduledTime: '18:30' });

    const stored = async (id: number) =>
      (await prisma.taskOccurrence.findFirstOrThrow({ where: { taskId: id } })).scheduledAtUtc;
    expect(await stored(none.body.id)).toBeNull();
    expect(await stored(dateOnly.body.id)).toBeNull();
    // 18:30 en Bogotá (UTC-5)
    expect((await stored(both.body.id))?.toISOString()).toBe('2026-11-28T23:30:00.000Z');
  });

  it('CA-03: rejects a time without a date, on scheduledTime', async () => {
    const res = await create({ title: 'Hora suelta', scheduledTime: '18:30' });

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([
      { field: 'scheduledTime', message: 'Pon una fecha para poder elegir la hora.' },
    ]);
  });

  it.each([
    ['a date that does not exist', { scheduledDate: '2026-02-30' }, 'scheduledDate'],
    ['a malformed date', { scheduledDate: '28/11/2026' }, 'scheduledDate'],
    ['a malformed time', { scheduledDate: '2026-11-28', scheduledTime: '25:00' }, 'scheduledTime'],
    ['a description over 5000 characters', { description: 'x'.repeat(5001) }, 'description'],
    ['a status in the body', { status: 'completed' }, 'status'],
    ['a priority in the body', { priority: 'high' }, 'priority'],
  ])('CA-03: rejects %s', async (_label, extra, field) => {
    const res = await create({ title: 'Inválido', ...extra });

    expect(res.status).toBe(422);
    expect(fieldErrors(res)).toContain(field);
  });

  it('allows past dates and stores a blank description as null', async () => {
    const res = await create({ title: 'Pasado', description: '   ', scheduledDate: '2020-01-01' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: null, scheduledDate: '2020-01-01' });
  });

  it('CA-09: answers 401 without a session', async () => {
    const res = await http().post(TASKS).send({ title: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /tasks', () => {
  it('CA-04: lists only my tasks, newest first, 20 per page, with a cursor for the next page', async () => {
    const ids: number[] = [];
    for (let i = 1; i <= 21; i++) ids.push((await seedTask(userId, `Tarea ${i}`)).id);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: 'beto@example.com' } });
    await seedTask(otherUser.id, 'De Beto');

    const first = await http().get(TASKS).set(bearer(token));
    expect(first.status).toBe(200);
    expect(first.body.items.map((t: { id: number }) => t.id)).toEqual(
      [...ids].reverse().slice(0, 20),
    );
    expect(first.body.items[0]).toMatchObject({ title: 'Tarea 21', status: 'pending' });
    expect(first.body.nextCursor).toBe(String(ids[1]));

    const second = await http()
      .get(TASKS)
      .query({ cursor: first.body.nextCursor })
      .set(bearer(token));
    expect(second.body.items.map((t: { id: number }) => t.id)).toEqual([ids[0]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('CA-04: honors limit and answers an empty page for a user without tasks', async () => {
    await seedTask(userId, 'Una');
    await seedTask(userId, 'Dos');

    const limited = await http().get(TASKS).query({ limit: 1 }).set(bearer(token));
    const empty = await http().get(TASKS).set(bearer(otherToken));

    expect(limited.body.items).toHaveLength(1);
    expect(limited.body.nextCursor).not.toBeNull();
    expect(empty.body).toEqual({ items: [], nextCursor: null });
  });

  it.each([
    ['limit=0', { limit: '0' }, 'limit'],
    ['limit=101', { limit: '101' }, 'limit'],
    ['limit=abc', { limit: 'abc' }, 'limit'],
    ['cursor=abc', { cursor: 'abc' }, 'cursor'],
    ['cursor=0', { cursor: '0' }, 'cursor'],
  ])('CA-04: rejects %s with 422', async (_label, query, field) => {
    const res = await http().get(TASKS).query(query).set(bearer(token));

    expect(res.status).toBe(422);
    expect(fieldErrors(res)).toEqual([field]);
  });

  it('CA-09: answers 401 without a session', async () => {
    expect((await http().get(TASKS)).status).toBe(401);
  });
});

describe('GET /tasks/:taskId', () => {
  it('CA-05: returns every field of my task', async () => {
    const created = await create({
      title: 'Cita',
      description: 'Con el médico',
      scheduledDate: '2026-12-01',
      scheduledTime: '09:15',
    });

    const res = await http().get(`${TASKS}/${created.body.id}`).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'createdAt',
        'description',
        'id',
        'priority',
        'scheduledDate',
        'scheduledTime',
        'status',
        'timezone',
        'title',
        'updatedAt',
      ].sort(),
    );
  });

  it('CA-07: answers 404 for another user task, a missing id and a non-numeric id', async () => {
    const theirs = await create({ title: 'Mío' });

    const responses = await Promise.all(
      [theirs.body.id, 999999, 'abc', '0', '-1', '1.5'].map((id) =>
        http().get(`${TASKS}/${id}`).set(bearer(otherToken)),
      ),
    );

    // Para Beto, el pendiente de Ana es ajeno y los demás ids no existen: todos responden igual.
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND', detail: 'Este pendiente no existe.' });
    }
  });

  it('CA-09: answers 401 without a session', async () => {
    expect((await http().get(`${TASKS}/1`)).status).toBe(401);
  });
});

describe('PATCH /tasks/:taskId', () => {
  const patch = (id: number | string, body: Record<string, unknown>, as = token) =>
    http().patch(`${TASKS}/${id}`).set(bearer(as)).send(body);

  it('CA-06: changes only the fields sent', async () => {
    const created = await create({
      title: 'Original',
      description: 'Texto',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });

    const res = await patch(created.body.id, { title: '  Nuevo título ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Nuevo título',
      description: 'Texto',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });
  });

  it('CA-06: null clears the description, and a blank description becomes null', async () => {
    const a = await create({ title: 'A', description: 'Texto' });
    const b = await create({ title: 'B', description: 'Texto' });

    expect((await patch(a.body.id, { description: null })).body.description).toBeNull();
    expect((await patch(b.body.id, { description: '   ' })).body.description).toBeNull();
  });

  it('CA-06: recalculates scheduled_at_utc and stores the current user timezone when the schedule changes', async () => {
    const created = await create({
      title: 'Mover',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });
    await prisma.user.update({ where: { id: userId }, data: { timezone: 'Asia/Tokyo' } });

    const res = await patch(created.body.id, {
      scheduledDate: '2026-12-02',
      scheduledTime: '08:00',
    });

    expect(res.body).toMatchObject({
      scheduledDate: '2026-12-02',
      scheduledTime: '08:00',
      timezone: 'Asia/Tokyo',
    });
    const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
      where: { taskId: created.body.id },
    });
    expect(occurrence.scheduledAtUtc?.toISOString()).toBe('2026-12-01T23:00:00.000Z');
  });

  it('CA-06: removing the date also removes the time and the UTC instant', async () => {
    const created = await create({
      title: 'Quitar',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });

    const res = await patch(created.body.id, { scheduledDate: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduledDate: null, scheduledTime: null });
    const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
      where: { taskId: created.body.id },
    });
    expect(occurrence.scheduledAtUtc).toBeNull();
    expect(occurrence.scheduledTime).toBeNull();
  });

  it('CA-06: removing only the time keeps the date', async () => {
    const created = await create({
      title: 'Sin hora',
      scheduledDate: '2026-11-28',
      scheduledTime: '18:30',
    });

    const res = await patch(created.body.id, { scheduledTime: null });

    expect(res.body).toMatchObject({ scheduledDate: '2026-11-28', scheduledTime: null });
  });

  it('CA-06: applies the create validations on the merged result', async () => {
    const noDate = await create({ title: 'Sin fecha' });
    const withDate = await create({ title: 'Con fecha', scheduledDate: '2026-11-28' });

    const timeNoDate = await patch(noDate.body.id, { scheduledTime: '10:00' });
    const dropDateKeepTime = await patch(withDate.body.id, {
      scheduledDate: null,
      scheduledTime: '10:00',
    });
    const blankTitle = await patch(withDate.body.id, { title: '  ' });
    const badDate = await patch(withDate.body.id, { scheduledDate: '2026-02-30' });

    expect(timeNoDate.status).toBe(422);
    expect(fieldErrors(timeNoDate)).toEqual(['scheduledTime']);
    expect(dropDateKeepTime.status).toBe(422);
    expect(fieldErrors(dropDateKeepTime)).toEqual(['scheduledTime']);
    expect(fieldErrors(blankTitle)).toEqual(['title']);
    expect(fieldErrors(badDate)).toEqual(['scheduledDate']);
    expect((await http().get(`${TASKS}/${withDate.body.id}`).set(bearer(token))).body).toEqual(
      withDate.body,
    );
  });

  it('CA-06: an empty body answers 200 and changes nothing', async () => {
    const created = await create({ title: 'Igual' });

    const res = await patch(created.body.id, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('CA-06: updates updatedAt even when only the schedule changes', async () => {
    const created = await create({ title: 'Reloj' });
    const later = new Date(Date.now() + 60_000);
    vi.spyOn(clock, 'now').mockReturnValue(later);

    const res = await patch(created.body.id, { scheduledDate: '2026-11-28' });

    expect(res.body.updatedAt).toBe(later.toISOString());
    expect(res.body.createdAt).toBe(created.body.createdAt);
  });

  it('CA-07: answers 404 for another user task and leaves it untouched', async () => {
    const theirs = await create({ title: 'De Ana', scheduledDate: '2026-11-28' });

    const res = await patch(theirs.body.id, { title: 'Robado', scheduledDate: null }, otherToken);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect((await http().get(`${TASKS}/${theirs.body.id}`).set(bearer(token))).body).toEqual(
      theirs.body,
    );
  });

  it('CA-07: answers 404 for a missing or non-numeric id', async () => {
    expect((await patch(999999, { title: 'x' })).status).toBe(404);
    expect((await patch('abc', { title: 'x' })).status).toBe(404);
    // El id se valida antes que el body: un id imposible es 404 aunque el body también sea inválido.
    expect((await patch('abc', { title: '' })).status).toBe(404);
  });

  it('CA-09: answers 401 without a session', async () => {
    expect((await http().patch(`${TASKS}/1`).send({ title: 'x' })).status).toBe(401);
  });
});

describe('DELETE /tasks/:taskId', () => {
  it('CA-08: does not exist: answers 404 and the task stays', async () => {
    const created = await create({ title: 'Permanente' });

    const res = await http().delete(`${TASKS}/${created.body.id}`).set(bearer(token));

    expect(res.status).toBe(404);
    expect(await prisma.task.count({ where: { id: created.body.id } })).toBe(1);
  });
});

describe('PUT /tasks/:taskId/status', () => {
  const put = (id: number | string, body: Record<string, unknown>, as = token) =>
    http().put(`${TASKS}/${id}/status`).set(bearer(as)).send(body);
  const occurrenceOf = (taskId: number) =>
    prisma.taskOccurrence.findFirstOrThrow({ where: { taskId } });
  const get = (id: number) => http().get(`${TASKS}/${id}`).set(bearer(token));

  it('CA-01: saves the new status, and a later GET and the list return it', async () => {
    const created = await create({ title: 'Cambiar' });
    const later = new Date(Date.now() + 60_000);
    vi.spyOn(clock, 'now').mockReturnValue(later);

    const res = await put(created.body.id, { status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.body.id, status: 'in_progress' });
    expect(res.body.updatedAt).toBe(later.toISOString());
    expect(res.body).not.toHaveProperty('completedAt');
    expect((await get(created.body.id)).body.status).toBe('in_progress');
    const list = await http().get(TASKS).set(bearer(token));
    expect(list.body.items[0].status).toBe('in_progress');
  });

  it.each([
    ['pending', 'in_progress'],
    ['pending', 'completed'],
    ['in_progress', 'pending'],
    ['in_progress', 'completed'],
    ['completed', 'pending'],
    ['completed', 'in_progress'],
  ] as const)('CA-02: allows %s -> %s', async (from, to) => {
    const task = await seedTask(userId, 'Transición');
    await prisma.taskOccurrence.updateMany({ where: { taskId: task.id }, data: { status: from } });

    const res = await put(task.id, { status: to });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(to);
    expect((await occurrenceOf(task.id)).status).toBe(to);
  });

  it('CA-03: sets completed_at from the clock on completing and clears it on leaving', async () => {
    const created = await create({ title: 'Completar' });
    const completedAt = new Date(Date.now() + 60_000);
    vi.spyOn(clock, 'now').mockReturnValue(completedAt);

    await put(created.body.id, { status: 'completed' });
    expect((await occurrenceOf(created.body.id)).completedAt).toEqual(completedAt);

    await put(created.body.id, { status: 'pending' });
    expect((await occurrenceOf(created.body.id)).completedAt).toBeNull();
  });

  it('CA-04: the same status answers 200 and changes neither updatedAt nor completed_at', async () => {
    const created = await create({ title: 'Igual' });
    const done = new Date(Date.now() + 60_000);
    vi.spyOn(clock, 'now').mockReturnValue(done);
    const completed = await put(created.body.id, { status: 'completed' });
    vi.spyOn(clock, 'now').mockReturnValue(new Date(done.getTime() + 60_000));

    const res = await put(created.body.id, { status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(completed.body);
    expect((await occurrenceOf(created.body.id)).completedAt).toEqual(done);
  });

  it.each([
    ['is missing', {}],
    ['is not a valid state', { status: 'done' }],
    ['is not text', { status: 3 }],
    ['comes with extra fields', { status: 'completed', title: 'x' }],
  ])('CA-06: rejects a body that %s with 422 and changes nothing', async (_label, body) => {
    const created = await create({ title: 'Validar' });

    const res = await put(created.body.id, body);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toHaveLength(1);
    expect((await get(created.body.id)).body).toEqual(created.body);
  });

  it('CA-06: reports the Spanish message on status', async () => {
    const created = await create({ title: 'Mensaje' });

    const res = await put(created.body.id, { status: 'done' });

    expect(res.body.errors).toEqual([{ field: 'status', message: 'Elige un estado válido.' }]);
  });

  it('CA-06: answers 404 for another user task and leaves it untouched', async () => {
    const theirs = await create({ title: 'De Ana' });

    const res = await put(theirs.body.id, { status: 'completed' }, otherToken);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect((await get(theirs.body.id)).body).toEqual(theirs.body);
    expect((await occurrenceOf(theirs.body.id)).completedAt).toBeNull();
  });

  it('CA-06: answers 404 for a missing or non-numeric id, even with an invalid body', async () => {
    expect((await put(999999, { status: 'completed' })).status).toBe(404);
    expect((await put('abc', { status: 'completed' })).status).toBe(404);
    expect((await put('abc', { status: 'done' })).status).toBe(404);
  });

  it('CA-07: answers 401 without a session', async () => {
    expect((await http().put(`${TASKS}/1/status`).send({ status: 'completed' })).status).toBe(401);
  });
});
