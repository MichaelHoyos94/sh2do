import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import { enqueueSendEmail } from '../src/shared/queue/queues.js';
import { bearer, http, registerUser } from './helpers.js';

const verify = (token: unknown) => http().post('/api/v1/auth/verify-email').send({ token });
const resend = (accessToken: string) =>
  http().post('/api/v1/auth/verification-email').set(bearer(accessToken));

/** Token en claro del último correo encolado (en la BD solo existe su hash). */
const lastQueuedToken = () => vi.mocked(enqueueSendEmail).mock.lastCall![0].token!;

describe('POST /auth/verify-email', () => {
  it('CA-04: verifies the email and burns the token', async () => {
    const { accessToken } = await registerUser();
    const token = lastQueuedToken();

    const res = await verify(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailVerified: true });
    const me = await http().get('/api/v1/users/me').set(bearer(accessToken));
    expect(me.body.emailVerified).toBe(true);

    const reuse = await verify(token);
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('VERIFICATION_TOKEN_INVALID');
  });

  it('CA-04: rejects an unknown token', async () => {
    const res = await verify('does-not-exist');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VERIFICATION_TOKEN_INVALID');
  });

  it('CA-04: rejects a token older than 24 hours', async () => {
    await registerUser();
    const token = lastQueuedToken();
    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 25 * 60 * 60 * 1000));

    const res = await verify(token);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VERIFICATION_TOKEN_EXPIRED');
    expect(await prisma.user.count({ where: { emailVerifiedAt: { not: null } } })).toBe(0);
  });

  it('rejects a missing token with 422', async () => {
    const res = await verify(undefined);

    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('token');
  });
});

describe('POST /auth/verification-email', () => {
  it('CA-05: queues a new email and voids the previous links', async () => {
    const { accessToken } = await registerUser();
    const oldToken = lastQueuedToken();

    const res = await resend(accessToken);

    expect(res.status).toBe(202);
    expect(enqueueSendEmail).toHaveBeenCalledTimes(2);
    expect((await verify(oldToken)).body.code).toBe('VERIFICATION_TOKEN_INVALID');
    expect((await verify(lastQueuedToken())).status).toBe(200);
    expect(await prisma.emailDelivery.count()).toBe(2);
  });

  it('CA-05: answers 409 when the email is already verified', async () => {
    const { accessToken } = await registerUser();
    await verify(lastQueuedToken());

    const res = await resend(accessToken);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('CA-05: limits resends to 3 per hour per user', async () => {
    const { accessToken } = await registerUser();
    for (let i = 0; i < 3; i++) expect((await resend(accessToken)).status).toBe(202);

    const res = await resend(accessToken);

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('requires a session', async () => {
    const res = await http().post('/api/v1/auth/verification-email');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});
