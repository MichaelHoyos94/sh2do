import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import { enqueueSendEmail } from '../src/shared/queue/queues.js';
import { hashToken } from '../src/shared/security/tokens.js';
import { http, refreshCookie, registerUser, withRefresh } from './helpers.js';

const forgot = (email: unknown) => http().post('/api/v1/auth/forgot-password').send({ email });
const check = (token: unknown) => http().post('/api/v1/auth/reset-password/check').send({ token });
const reset = (token: unknown, password: unknown = 'a brand new password') =>
  http().post('/api/v1/auth/reset-password').send({ token, password });
const login = (password: string) =>
  http().post('/api/v1/auth/login').send({ email: 'ana@example.com', password });

/** Token en claro del último correo encolado (en la BD solo existe su hash). */
const lastQueuedToken = () => vi.mocked(enqueueSendEmail).mock.lastCall![0].token!;

/** Registra a Ana y pide el enlace de recuperación; devuelve su token y el refresh de la sesión. */
async function requestLink() {
  const { refreshToken } = await registerUser();
  await forgot('ana@example.com');
  return { token: lastQueuedToken(), refreshToken };
}

describe('POST /auth/forgot-password', () => {
  it('CA-01: stores a hashed token valid 24 h, creates the delivery and queues the job', async () => {
    await registerUser();

    const res = await forgot('  ANA@example.com ');

    expect(res.status).toBe(202);
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashToken(lastQueuedToken()));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeCloseTo(24 * 3600_000, -4);
    const delivery = await prisma.emailDelivery.findFirstOrThrow({
      where: { kind: 'reset_password' },
    });
    expect(delivery).toMatchObject({
      recipientEmail: 'ana@example.com',
      status: 'queued',
      dedupeKey: `reset_password:${row.id}`,
    });
    expect(enqueueSendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ deliveryId: delivery.id, displayName: 'Ana' }),
    );
  });

  it('CA-02: answers 202 for an unknown email without creating a token or a delivery', async () => {
    const res = await forgot('nobody@example.com');

    expect(res.status).toBe(202);
    expect(res.text).toBe('');
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(await prisma.emailDelivery.count()).toBe(0);
    expect(enqueueSendEmail).not.toHaveBeenCalled();
  });

  it('CA-03: a new request voids the previous link', async () => {
    const { token: oldToken } = await requestLink();
    await forgot('ana@example.com');

    const res = await check(oldToken);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
    expect((await check(lastQueuedToken())).status).toBe(204);
    expect(await prisma.emailDelivery.count({ where: { kind: 'reset_password' } })).toBe(2);
  });

  it('CA-04: limits to 3 per hour per email, existing or not', async () => {
    for (let i = 0; i < 3; i++) expect((await forgot('nobody@example.com')).status).toBe(202);

    const res = await forgot('NOBODY@example.com');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('CA-04: limits to 10 per hour per IP', async () => {
    for (let i = 0; i < 10; i++) expect((await forgot(`user${i}@example.com`)).status).toBe(202);

    const res = await forgot('another@example.com');

    expect(res.status).toBe(429);
  });

  it('rejects an invalid email with 422', async () => {
    const res = await forgot('not-an-email');

    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('email');
  });
});

describe('POST /auth/reset-password/check', () => {
  it('CA-07: rejects an unknown token and validates the body', async () => {
    const res = await check('does-not-exist');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');

    const invalid = await check(undefined);
    expect(invalid.status).toBe(422);
    expect(invalid.body.errors[0].field).toBe('token');
  });

  it('CA-07: rejects a token older than 24 hours', async () => {
    const { token } = await requestLink();
    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 25 * 3600_000));

    const res = await check(token);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_EXPIRED');
    expect((await reset(token)).body.code).toBe('PASSWORD_RESET_TOKEN_EXPIRED');
  });
});

describe('POST /auth/reset-password', () => {
  it('CA-05: changes the password, revokes every session, clears the cookie and queues the notice', async () => {
    const { token, refreshToken } = await requestLink();

    const res = await reset(token);

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']![0]).toMatch(
      /^sh2do_rt=;.*Max-Age=0.*HttpOnly.*SameSite=Strict/i,
    );
    expect(refreshCookie(res)).toBe('');
    expect((await login('a brand new password')).status).toBe(200);
    expect((await login('correct horse battery')).status).toBe(401);
    const refresh = await http().post('/api/v1/auth/refresh').set(withRefresh(refreshToken));
    expect(refresh.status).toBe(401);
    const notice = await prisma.emailDelivery.findFirstOrThrow({
      where: { kind: 'password_changed' },
    });
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(notice.dedupeKey).toBe(`password_changed:${row.id}`);
    expect(enqueueSendEmail).toHaveBeenCalledWith({ deliveryId: notice.id, displayName: 'Ana' });
  });

  it('CA-07: a used link cannot be used again', async () => {
    const { token } = await requestLink();
    expect((await reset(token)).status).toBe(204);

    const res = await check(token);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
  });

  it('CA-07: two simultaneous requests with the same token: only one succeeds', async () => {
    const { token } = await requestLink();

    const results = await Promise.all([
      reset(token, 'first new password'),
      reset(token, 'second new password'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
    expect(await prisma.emailDelivery.count({ where: { kind: 'password_changed' } })).toBe(1);
  });

  it('CA-08: marks an unverified email as verified', async () => {
    const { token } = await requestLink();
    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();

    await reset(token);

    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).not.toBeNull();
  });

  it('CA-06: rejects a password shorter than 8 or longer than 128 characters with 422', async () => {
    const { token } = await requestLink();

    for (const password of ['short', 'x'.repeat(129)]) {
      const res = await reset(token, password);
      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toBe('password');
    }
    expect((await check(token)).status).toBe(204); // el enlace no se gastó
  });
});
