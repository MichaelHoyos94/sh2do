import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/db/prisma.js';
import { bearer, http, registerUser } from './helpers.js';

const TAGS = '/api/v1/tags';

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

const create = (name: unknown, as = token) => http().post(TAGS).set(bearer(as)).send({ name });
const rename = (id: number | string, body: unknown, as = token) =>
  http()
    .patch(`${TAGS}/${id}`)
    .set(bearer(as))
    .send(body as object);
const remove = (id: number | string, as = token) => http().delete(`${TAGS}/${id}`).set(bearer(as));
const seedTag = (owner: number, name: string) =>
  prisma.tag.create({ data: { userId: owner, name } });
const nameOf = async (id: number) => (await prisma.tag.findUniqueOrThrow({ where: { id } })).name;

describe('POST /tags', () => {
  it('CA-01: creates a tag with the normalized name', async () => {
    const res = await create('  Casa   y  jardín ');

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`${TAGS}/${res.body.id}`);
    expect(res.body).toMatchObject({ name: 'Casa y jardín' });
    expect(typeof res.body.createdAt).toBe('string');
    expect((await prisma.tag.findUniqueOrThrow({ where: { id: res.body.id } })).userId).toBe(
      userId,
    );
  });

  it.each([
    ['is empty', { name: '' }, 'El nombre es obligatorio.'],
    ['is only spaces', { name: '   ' }, 'El nombre es obligatorio.'],
    ['is missing', {}, 'El nombre es obligatorio.'],
    ['is not text', { name: 5 }, 'El nombre es obligatorio.'],
    [
      'is longer than 60 characters after normalizing',
      { name: 'x'.repeat(61) },
      'El nombre admite como máximo 60 caracteres.',
    ],
  ])('CA-02: rejects a name that %s', async (_label, body, message) => {
    const res = await http().post(TAGS).set(bearer(token)).send(body);

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([{ field: 'name', message }]);
    expect(await prisma.tag.count()).toBe(0);
  });

  it('CA-02: accepts 60 characters after normalizing and rejects extra fields', async () => {
    expect((await create(`  ${'x'.repeat(60)}  `)).status).toBe(201);

    const res = await http().post(TAGS).set(bearer(token)).send({ name: 'Ok', color: 'red' });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('color');
  });

  it('CA-03: rejects a duplicate that differs only by case or spacing', async () => {
    await create('Trabajo');

    for (const name of ['trabajo', 'TRABAJO', ' Trabajo ']) {
      const res = await create(name);
      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        code: 'TAG_NAME_TAKEN',
        errors: [{ field: 'name', message: 'Ya tienes una etiqueta con ese nombre.' }],
      });
    }
    expect(await prisma.tag.count()).toBe(1);
  });

  it('CA-03: treats accents as different names', async () => {
    await create('Café');
    expect((await create('Cafe')).status).toBe(201);
  });

  it('CA-04: lets two users have the same name', async () => {
    await create('Trabajo');
    expect((await create('Trabajo', otherToken)).status).toBe(201);
  });
});

describe('GET /tags', () => {
  it('CA-07: lists only my tags, alphabetically ignoring case', async () => {
    await seedTag(userId, 'banco');
    await seedTag(userId, 'Álgebra');
    await seedTag(userId, 'Casa');
    await seedTag(userId, 'alpha');
    await seedTag(otherId, 'Ajena');

    const res = await http().get(TAGS).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { name: string }) => t.name)).toEqual([
      'Álgebra',
      'alpha',
      'banco',
      'Casa',
    ]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('CA-07: returns an empty page when there are no tags', async () => {
    const res = await http().get(TAGS).set(bearer(token));
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('CA-07: paginates by cursor', async () => {
    for (const name of ['a', 'b', 'c']) await seedTag(userId, name);

    const first = await http().get(`${TAGS}?limit=2`).set(bearer(token));
    expect(first.body.items.map((t: { name: string }) => t.name)).toEqual(['a', 'b']);
    expect(first.body.nextCursor).toBe(String(first.body.items[1].id));

    const second = await http()
      .get(`${TAGS}?limit=2&cursor=${first.body.nextCursor}`)
      .set(bearer(token));
    expect(second.body.items.map((t: { name: string }) => t.name)).toEqual(['c']);
    expect(second.body.nextCursor).toBeNull();
  });

  it("RN-PRO-1: rejects another user's tag as cursor without revealing anything", async () => {
    await seedTag(userId, 'a');
    await seedTag(userId, 'z');
    const foreign = await seedTag(otherId, 'm');

    for (const cursor of [foreign.id, foreign.id + 1000]) {
      const res = await http().get(`${TAGS}?cursor=${cursor}`).set(bearer(token));
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual([{ field: 'cursor', message: 'El cursor no es válido.' }]);
    }
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'cursor=abc', 'cursor=0', 'other=1'])(
    'rejects the invalid query %s',
    async (query) => {
      const res = await http().get(`${TAGS}?${query}`).set(bearer(token));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    },
  );
});

describe('PATCH /tags/:tagId', () => {
  it('CA-05: renames the tag', async () => {
    const tag = await seedTag(userId, 'Trabajo');

    const res = await rename(tag.id, { name: '  Oficina  ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: tag.id, name: 'Oficina' });
    expect(await nameOf(tag.id)).toBe('Oficina');
  });

  it('CA-05: allows changing only the case of its own name', async () => {
    const tag = await seedTag(userId, 'trabajo');

    const res = await rename(tag.id, { name: 'Trabajo' });

    expect(res.status).toBe(200);
    expect(await nameOf(tag.id)).toBe('Trabajo');
  });

  it('CA-05: an identical name responds 200 and writes nothing', async () => {
    const tag = await seedTag(userId, 'Trabajo');

    const res = await rename(tag.id, { name: ' Trabajo ' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Trabajo');
  });

  it('CA-05: rejects a name already used by another of my tags', async () => {
    await seedTag(userId, 'Casa');
    const tag = await seedTag(userId, 'Trabajo');

    const res = await rename(tag.id, { name: 'CASA' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TAG_NAME_TAKEN');
    expect(await nameOf(tag.id)).toBe('Trabajo');
  });

  it('CA-05: rejects an invalid name', async () => {
    const tag = await seedTag(userId, 'Trabajo');

    const res = await rename(tag.id, { name: '  ' });

    expect(res.status).toBe(422);
    expect(await nameOf(tag.id)).toBe('Trabajo');
  });

  it('CA-08: responds 404 for another user tag and changes nothing', async () => {
    const tag = await seedTag(otherId, 'Ajena');

    const res = await rename(tag.id, { name: 'Mia' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', detail: 'Esta etiqueta no existe.' });
    expect(await nameOf(tag.id)).toBe('Ajena');
  });

  it('CA-08: responds 404 for a missing tag and validates the id before the body', async () => {
    expect((await rename(999999, { name: 'Ok' })).status).toBe(404);
    expect((await rename('abc', { name: '' })).status).toBe(404);
    expect((await rename(0, { name: 'Ok' })).status).toBe(404);
  });
});

describe('DELETE /tags/:tagId', () => {
  it('CA-06: deletes the tag and its task links without touching the tasks', async () => {
    const tag = await seedTag(userId, 'Trabajo');
    const keep = await seedTag(userId, 'Casa');
    const task = await prisma.task.create({
      data: {
        userId,
        title: 'Pendiente',
        occurrences: { create: { sequenceNo: 0, timezone: 'America/Bogota' } },
      },
    });
    await prisma.taskTag.createMany({
      data: [
        { taskId: task.id, tagId: tag.id },
        { taskId: task.id, tagId: keep.id },
      ],
    });

    const res = await remove(tag.id);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    expect((await prisma.taskTag.findMany()).map((l) => l.tagId)).toEqual([keep.id]);
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.taskOccurrence.count()).toBe(1);
  });

  it('CA-08: responds 404 for another user tag and keeps it', async () => {
    const tag = await seedTag(otherId, 'Ajena');

    expect((await remove(tag.id)).status).toBe(404);
    expect(await prisma.tag.count()).toBe(1);
  });

  it('CA-08: responds 404 for a missing or non-numeric id', async () => {
    expect((await remove(999999)).status).toBe(404);
    expect((await remove('abc')).status).toBe(404);
  });
});

describe('authentication', () => {
  it.each([
    ['GET', TAGS],
    ['POST', TAGS],
    ['PATCH', `${TAGS}/1`],
    ['DELETE', `${TAGS}/1`],
  ] as const)('CA-09: %s %s without a session responds 401', async (method, path) => {
    const res = await http()[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('R-09: an unverified account can manage tags', async () => {
    expect((await create('Trabajo')).status).toBe(201);
  });
});
