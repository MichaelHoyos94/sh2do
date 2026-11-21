import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { env } from '../src/shared/config/env.js';
import { prisma } from '../src/shared/db/prisma.js';
import { enqueueSendEmail } from '../src/shared/queue/queues.js';
import { hashToken } from '../src/shared/security/tokens.js';
import { http, refreshCookie, validRegistration } from './helpers.js';

const register = (body: Record<string, unknown> = validRegistration()) =>
  http().post('/api/v1/auth/register').send(body);

describe('POST /auth/register', () => {
  it('CA-01: creates the account, starts the session and queues the verification email', async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-01-10T12:00:00.000Z'));

    const res = await register(
      validRegistration({ email: '  Ana@Example.COM ', displayName: '  Ana ' }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      accessTokenExpiresIn: 900,
      user: {
        displayName: 'Ana',
        email: 'ana@example.com',
        emailVerified: false,
        timezone: 'America/Bogota',
      },
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('passwordHash');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/Max-Age=2592000/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.refreshTokenHash).toBe(hashToken(refreshCookie(res)!));

    const token = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(token.expiresAt).toEqual(new Date('2026-01-11T12:00:00.000Z'));
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { userId: user.id } });
    expect(delivery).toMatchObject({
      kind: 'verify_email',
      status: 'queued',
      recipientEmail: 'ana@example.com',
      dedupeKey: `verify_email:${token.id}`,
    });

    // El job lleva el token en claro; en la BD solo está su hash.
    expect(enqueueSendEmail).toHaveBeenCalledOnce();
    const job = vi.mocked(enqueueSendEmail).mock.calls[0]![0];
    expect(job).toMatchObject({ deliveryId: delivery.id, displayName: 'Ana' });
    expect(hashToken(job.token!)).toBe(token.tokenHash);
  });

  it('keeps the account when the job cannot be queued', async () => {
    vi.mocked(enqueueSendEmail).mockRejectedValueOnce(new Error('redis down'));

    const res = await register();

    expect(res.status).toBe(201);
    expect(await prisma.emailDelivery.count({ where: { status: 'queued' } })).toBe(1);
  });

  it('stores UTC when the timezone is not a valid IANA zone', async () => {
    const res = await register(validRegistration({ timezone: 'Mars/Olympus' }));

    expect(res.status).toBe(201);
    expect(res.body.user.timezone).toBe('UTC');
  });

  it('CA-02: rejects invalid data with one error per field', async () => {
    const res = await register({
      displayName: 'A',
      email: 'not-an-email',
      password: 'short',
      timezone: 'UTC',
    });

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
    expect(await prisma.user.count()).toBe(0);
  });

  it('CA-02: reports every required field when the body is empty', async () => {
    const res = await http().post('/api/v1/auth/register');

    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(4);
  });

  it('CA-03: answers 409 for a duplicate email, whatever its case or spacing', async () => {
    await register();

    const res = await register(validRegistration({ email: ' ANA@example.com ' }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    expect(await prisma.user.count()).toBe(1);
  });

  it('CA-13: limits registrations to 5 per hour per IP', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await register(validRegistration({ email: `user${i}@example.com` }));
      expect(ok.status).toBe(201);
    }

    const res = await register(validRegistration({ email: 'user5@example.com' }));

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('POST /auth/register: input rules', () => {
  it.each([
    ['+05:00', 'UTC'],
    ['EST', 'UTC'],
    ['america/bogota', 'America/Bogota'],
    ['America/Bogota', 'America/Bogota'],
    ['UTC', 'UTC'],
    ['Asia/Kolkata', 'Asia/Calcutta'],
    ['America/Argentina/Buenos_Aires', 'America/Buenos_Aires'],
    ['Europe/Kyiv', 'Europe/Kiev'],
    ['Asia/Kathmandu', 'Asia/Katmandu'],
    ['Etc/UTC', 'UTC'],
    ['Mars/Olympus', 'UTC'],
  ])('stores timezone %s as %s', async (sent, stored) => {
    const res = await register(validRegistration({ timezone: sent }));

    expect(res.status).toBe(201);
    expect(res.body.user.timezone).toBe(stored);
  });

  it('CA-02: enforces the upper limits (name 61, password 129, email 255 characters)', async () => {
    const res = await register(
      validRegistration({
        displayName: 'a'.repeat(61),
        password: 'p'.repeat(129),
        email: `${'a'.repeat(243)}@example.com`, // 255 caracteres
      }),
    );

    expect(res.status).toBe(422);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
  });

  it('reports each unknown key as its own field error', async () => {
    const res = await register(validRegistration({ role: 'admin', extra: 1 }));

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([
      { field: 'role', message: 'Campo no permitido.' },
      { field: 'extra', message: 'Campo no permitido.' },
    ]);
  });

  it('marks the refresh cookie Secure when COOKIE_SECURE=true', async () => {
    (env as { COOKIE_SECURE: boolean }).COOKIE_SECURE = true;
    try {
      const res = await register();

      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/; Secure/i);
    } finally {
      (env as { COOKIE_SECURE: boolean }).COOKIE_SECURE = false;
    }
  });
});
