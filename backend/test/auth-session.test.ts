import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import { redis } from '../src/shared/redis.js';
import { http, refreshCookie, registerUser, withRefresh } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const login = (email = 'ana@example.com', password = 'correct horse battery') =>
  http().post('/api/v1/auth/login').send({ email, password });

const refresh = (token?: string) => {
  const req = http().post('/api/v1/auth/refresh');
  return token ? req.set(withRefresh(token)) : req;
};

describe('POST /auth/login', () => {
  it('CA-06: signs in even if the email is not verified', async () => {
    await registerUser();

    const res = await login(' ANA@example.com ');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ana@example.com', emailVerified: false });
    expect(refreshCookie(res)).toBeTruthy();
  });

  it('CA-07: gives the same 401 for an unknown email and a wrong password', async () => {
    await registerUser();

    const unknown = await login('nobody@example.com');
    const wrongPassword = await login('ana@example.com', 'wrong password');

    expect(unknown.status).toBe(401);
    expect(unknown.body).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      detail: 'Correo o contraseña incorrectos.',
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
  });

  it('rejects an invalid body with 422', async () => {
    const res = await http().post('/api/v1/auth/login').send({ email: 'nope', password: '' });

    expect(res.status).toBe(422);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('CA-08: blocks the 6th attempt after 5 failures, and a success resets the count', async () => {
    await registerUser();
    for (let i = 0; i < 2; i++) await login('ana@example.com', 'wrong');
    expect((await login()).status).toBe(200); // un éxito reinicia el contador

    for (let i = 0; i < 5; i++) expect((await login('ana@example.com', 'wrong')).status).toBe(401);
    const blocked = await login(); // aunque la contraseña sea correcta

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('B-1: simultaneous failed logins cannot bypass the limit', async () => {
    await registerUser();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => login('ana@example.com', 'wrong')),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });

  it('keys the limit by email: failures for one email do not block another', async () => {
    await registerUser();
    for (let i = 0; i < 5; i++) await login('ana@example.com', 'wrong');

    expect((await login('ana@example.com', 'wrong')).status).toBe(429);
    expect((await login('other@example.com', 'wrong')).status).toBe(401);
  });

  it('does not store the email in clear text in Redis keys', async () => {
    await login('ana@example.com', 'wrong');

    const keys = await redis.keys('rl:login:*');

    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('ana@example.com');
  });
});

describe('POST /auth/refresh', () => {
  it('CA-10: rotates the refresh token and issues a new access token', async () => {
    const { refreshToken } = await registerUser();

    const res = await refresh(refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toBeTruthy();
    expect(refreshCookie(res)).not.toBe(refreshToken);
  });

  it('CA-10: reusing a rotated token after the race margin revokes every session', async () => {
    const { refreshToken } = await registerUser();
    const rotated = refreshCookie(await refresh(refreshToken))!;
    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 11_000));

    const reuse = await refresh(refreshToken);

    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_INVALID');
    expect((reuse.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Max-Age=0/);
    expect((await refresh(rotated)).status).toBe(401); // la sesión nueva también quedó revocada
    expect(await prisma.userSession.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('M-1: two simultaneous refreshes → one wins, the loser gets 401 without killing the session', async () => {
    const { refreshToken } = await registerUser();

    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

    const winner = results.find((r) => r.status === 200)!;
    const loser = results.find((r) => r.status === 401)!;
    expect(winner).toBeDefined();
    expect(loser.body.code).toBe('SESSION_INVALID');
    expect(loser.headers['set-cookie']).toBeUndefined(); // no borra la cookie del ganador
    expect((await refresh(refreshCookie(winner)!)).status).toBe(200); // su sesión sigue viva
  });

  it('M-1: a reuse within the 10 s margin is rejected without revoking other sessions', async () => {
    const { refreshToken } = await registerUser();
    const rotated = refreshCookie(await refresh(refreshToken))!;

    const reuse = await refresh(refreshToken);

    expect(reuse.status).toBe(401);
    expect(reuse.headers['set-cookie']).toBeUndefined();
    expect((await refresh(rotated)).status).toBe(200);
  });

  it('CA-10: rejects a missing or expired refresh token', async () => {
    const { refreshToken } = await registerUser();

    expect((await refresh()).status).toBe(401);

    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 31 * DAY_MS));
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('slides the expiry: the new session lasts 30 days from the refresh', async () => {
    const { refreshToken } = await registerUser();
    const start = Date.now();
    vi.spyOn(clock, 'now').mockReturnValue(new Date(start + 20 * DAY_MS));
    const rotated = refreshCookie(await refresh(refreshToken))!;

    // 35 días desde el registro: solo sigue viva si la renovación movió el vencimiento
    vi.spyOn(clock, 'now').mockReturnValue(new Date(start + 35 * DAY_MS));

    expect((await refresh(rotated)).status).toBe(200);
  });
});

describe('POST /auth/logout', () => {
  it('CA-09: revokes the session so a later refresh fails', async () => {
    const { refreshToken } = await registerUser();

    const res = await http().post('/api/v1/auth/logout').set(withRefresh(refreshToken));

    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Max-Age=0/);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('is idempotent without a cookie', async () => {
    expect((await http().post('/api/v1/auth/logout')).status).toBe(204);
  });
});
