import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/prisma.js';
import { bearer, http, registerUser } from './helpers.js';

const TASKS = '/api/v1/tasks';

let token: string;
let userId: number;
let otherToken: string;
let otherId: number;

beforeEach(async () => {
  token = (await registerUser()).accessToken;
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } })).id;
  otherToken = (await registerUser({ email: 'beto@example.com', displayName: 'Beto' })).accessToken;
  otherId = (await prisma.user.findUniqueOrThrow({ where: { email: 'beto@example.com' } })).id;
});

const create = (body: Record<string, unknown>, as = token) =>
  http().post(TASKS).set(bearer(as)).send(body);
const patch = (id: number, body: Record<string, unknown>, as = token) =>
  http().patch(`${TASKS}/${id}`).set(bearer(as)).send(body);
const list = (query: Record<string, unknown>, as = token) =>
  http().get(TASKS).query(query).set(bearer(as));
const seedTag = async (owner: number, name: string) =>
  (await prisma.tag.create({ data: { userId: owner, name } })).id;
const tagNames = (res: { body: { tags: { name: string }[] } }) => res.body.tags.map((t) => t.name);
const titles = (res: { body: { items: { title: string }[] } }) =>
  res.body.items.map((t) => t.title).sort();
const fieldErrors = (res: { body: { errors?: { field: string }[] } }) =>
  (res.body.errors ?? []).map((e) => e.field);
const storedTagIds = async (taskId: number) =>
  (await prisma.taskTag.findMany({ where: { taskId } })).map((t) => t.tagId).sort();

describe('priority and tags on create and edit', () => {
  it('CA-01 CA-02: creates with the chosen priority, and defaults to medium', async () => {
    const high = await create({ title: 'Urgente', priority: 'high' });
    const none = await create({ title: 'Normal' });

    expect(high.body.priority).toBe('high');
    expect(none.body.priority).toBe('medium');
    expect((await patch(none.body.id, { priority: 'low' })).body.priority).toBe('low');
    expect((await http().get(`${TASKS}/${none.body.id}`).set(bearer(token))).body.priority).toBe(
      'low',
    );
  });

  it('CA-02: rejects an unknown priority with the Spanish message on priority', async () => {
    const created = await create({ title: 'x' });
    const onCreate = await create({ title: 'x', priority: 'urgent' });
    const onPatch = await patch(created.body.id, { priority: 'urgent' });

    for (const res of [onCreate, onPatch]) {
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual([
        { field: 'priority', message: 'Elige una prioridad válida.' },
      ]);
    }
  });

  it('CA-03: returns the tags in alphabetical order, in create, GET and PUT /status', async () => {
    const zeta = await seedTag(userId, 'zeta');
    const alfa = await seedTag(userId, 'Alfa');
    const media = await seedTag(userId, 'media');

    const created = await create({ title: 'Con etiquetas', tagIds: [zeta, alfa, media] });
    const got = await http().get(`${TASKS}/${created.body.id}`).set(bearer(token));
    const status = await http()
      .put(`${TASKS}/${created.body.id}/status`)
      .set(bearer(token))
      .send({ status: 'completed' });

    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual([
      { id: alfa, name: 'Alfa' },
      { id: media, name: 'media' },
      { id: zeta, name: 'zeta' },
    ]);
    expect(tagNames(got)).toEqual(['Alfa', 'media', 'zeta']);
    expect(tagNames(status)).toEqual(['Alfa', 'media', 'zeta']);
    expect((await create({ title: 'Sin' })).body.tags).toEqual([]);
  });

  it('CA-03: PATCH replaces the set, [] clears it and an absent tagIds leaves it alone', async () => {
    const a = await seedTag(userId, 'a');
    const b = await seedTag(userId, 'b');
    const c = await seedTag(userId, 'c');
    const created = await create({ title: 'T', tagIds: [a, b] });
    const id = created.body.id;

    expect(tagNames(await patch(id, { tagIds: [c, b] }))).toEqual(['b', 'c']);
    expect(await storedTagIds(id)).toEqual([b, c]);
    expect(tagNames(await patch(id, { title: 'Otro' }))).toEqual(['b', 'c']);
    expect((await patch(id, { tagIds: [] })).body.tags).toEqual([]);
    expect(await storedTagIds(id)).toEqual([]);
  });

  it('CA-03: the same priority and tag set in another order answers 200 without touching updatedAt', async () => {
    const a = await seedTag(userId, 'a');
    const b = await seedTag(userId, 'b');
    const created = await create({ title: 'T', priority: 'high', tagIds: [a, b] });

    const same = await patch(created.body.id, { priority: 'high', tagIds: [b, a] });
    expect(same.status).toBe(200);
    expect(same.body).toEqual(created.body);

    const changed = await patch(created.body.id, { priority: 'low' });
    expect(changed.body.updatedAt).not.toBe(created.body.updatedAt);
  });

  it('CA-04: rejects another user tag, a missing tag, repeats, more than 20 and bad ids on tagIds', async () => {
    const mine = await seedTag(userId, 'mia');
    const theirs = await seedTag(otherId, 'ajena');
    const existing = await create({ title: 'T', tagIds: [mine] });
    const missing = 999999;
    const many = Array.from({ length: 21 }, (_, i) => i + 1);

    const cases: [unknown, string][] = [
      [[theirs], 'Alguna de las etiquetas elegidas no existe.'],
      [[mine, missing], 'Alguna de las etiquetas elegidas no existe.'],
      [[mine, mine], 'No repitas etiquetas.'],
      [many, 'Un pendiente admite como máximo 20 etiquetas.'],
      [['1'], 'Los ids de etiquetas deben ser enteros positivos.'],
      ['1', 'Las etiquetas deben ser una lista de ids.'],
    ];
    for (const [tagIds, message] of cases) {
      const onCreate = await create({ title: 'Nuevo', tagIds });
      const onPatch = await patch(existing.body.id, { title: 'Cambio', tagIds });
      for (const res of [onCreate, onPatch]) {
        expect(res.status).toBe(422);
        expect(res.body.errors).toEqual([{ field: 'tagIds', message }]);
      }
    }
    expect(await prisma.task.count()).toBe(1);
    expect(await storedTagIds(existing.body.id)).toEqual([mine]);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: existing.body.id } })).title).toBe(
      'T',
    );
  });

  it('CA-10: answers 401 without a session on POST and PATCH', async () => {
    expect((await http().post(TASKS).send({ title: 'x', priority: 'low' })).status).toBe(401);
    expect((await http().patch(`${TASKS}/1`).send({ priority: 'low' })).status).toBe(401);
  });
});

describe('GET /tasks filters', () => {
  let work: number;
  let home: number;

  /** Cuatro pendientes con prioridad, estado y etiquetas distintos, más uno de Beto. */
  beforeEach(async () => {
    work = await seedTag(userId, 'work');
    home = await seedTag(userId, 'home');
    await create({ title: 'A', priority: 'high', tagIds: [work] });
    await create({ title: 'B', priority: 'low', tagIds: [home] });
    const c = await create({ title: 'C', priority: 'high', tagIds: [work, home] });
    await create({ title: 'D', priority: 'medium' });
    await http()
      .put(`${TASKS}/${c.body.id}/status`)
      .set(bearer(token))
      .send({ status: 'completed' });
    const theirsTag = await seedTag(otherId, 'work');
    await create({ title: 'Ajeno', priority: 'high', tagIds: [theirsTag] }, otherToken);
  });

  it('CA-05: matches any value inside one parameter (OR)', async () => {
    expect(titles(await list({ status: 'completed,in_progress' }))).toEqual(['C']);
    expect(titles(await list({ priority: 'high,low' }))).toEqual(['A', 'B', 'C']);
    expect(titles(await list({ tagIds: `${work},${home}` }))).toEqual(['A', 'B', 'C']);
    expect(titles(await list({ tagIds: `${home}` }))).toEqual(['B', 'C']);
  });

  it('CA-06: requires every parameter (AND), with no filters meaning everything', async () => {
    const res = await list({ status: 'pending,completed', priority: 'high', tagIds: `${home}` });

    expect(titles(res)).toEqual(['C']);
    expect(titles(await list({ status: 'pending', priority: 'high' }))).toEqual(['A']);
    expect(titles(await list({}))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('CA-06: paginates with the filters and keeps the id order', async () => {
    const first = await list({ priority: 'high,low', limit: 2 });
    const second = await list({ priority: 'high,low', limit: 2, cursor: first.body.nextCursor });

    expect(first.body.items.map((t: { title: string }) => t.title)).toEqual(['C', 'B']);
    expect(second.body.items.map((t: { title: string }) => t.title)).toEqual(['A']);
    expect(second.body.nextCursor).toBeNull();
    expect(first.body.items[0].tags.map((t: { name: string }) => t.name)).toEqual(['home', 'work']);
  });

  it('CA-07: never shows other users tasks, and a foreign tag id matches nothing', async () => {
    const theirs = (await prisma.tag.findFirstOrThrow({ where: { userId: otherId } })).id;

    expect((await list({ tagIds: `${theirs}` })).body).toEqual({ items: [], nextCursor: null });
    expect(titles(await list({ priority: 'high' }))).toEqual(['A', 'C']);
    expect(titles(await list({ priority: 'high' }, otherToken))).toEqual(['Ajeno']);
  });

  it.each([
    ['status', { status: 'done' }],
    ['status', { status: '' }],
    ['status', { status: 'pending,' }],
    ['priority', { priority: 'urgent' }],
    ['priority', { priority: 'high,,low' }],
    ['tagIds', { tagIds: 'abc' }],
    ['tagIds', { tagIds: '0' }],
    ['tagIds', { tagIds: '' }],
    ['tagIds', { tagIds: Array.from({ length: 21 }, (_, i) => i + 1).join(',') }],
    ['status', { status: ['pending', 'completed'] }],
  ])('CA-07: rejects an invalid %s with 422 on that parameter', async (field, query) => {
    const res = await list(query);

    expect(res.status).toBe(422);
    expect(fieldErrors(res)).toEqual([field]);
  });

  it('CA-10: answers 401 without a session', async () => {
    expect((await http().get(TASKS).query({ priority: 'high' })).status).toBe(401);
  });
});
