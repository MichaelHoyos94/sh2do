import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import { bearer, http, registerUser } from './helpers.js';

describe('GET /users/me', () => {
  it('returns the current user', async () => {
    const { accessToken } = await registerUser();

    const res = await http().get('/api/v1/users/me').set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      displayName: 'Ana',
      email: 'ana@example.com',
      emailVerified: false,
      timezone: 'America/Bogota',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('CA-11: answers 401 without a token, with a malformed one or with an expired one', async () => {
    const { accessToken } = await registerUser();

    const none = await http().get('/api/v1/users/me');
    const garbage = await http().get('/api/v1/users/me').set(bearer('not.a.jwt'));
    vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 16 * 60 * 1000));
    const expired = await http().get('/api/v1/users/me').set(bearer(accessToken));

    for (const res of [none, garbage, expired]) {
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('answers 401 when the token belongs to a deleted user', async () => {
    const { accessToken } = await registerUser();
    await prisma.emailDelivery.deleteMany();
    await prisma.emailVerificationToken.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();

    const res = await http().get('/api/v1/users/me').set(bearer(accessToken));

    expect(res.status).toBe(401);
  });
});

describe('HTTP basics', () => {
  it('reports liveness for Docker', async () => {
    expect((await http().get('/health')).body).toEqual({ status: 'ok' });
  });

  it('answers unknown routes with a problem+json 404', async () => {
    const res = await http().get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('answers a malformed JSON body with 400', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await http().get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
