import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/shared/config/env.js';
import { AppError } from '../src/shared/http/problem.js';
import { consume } from '../src/shared/security/rate-limit.js';
import { generateToken, hashToken } from '../src/shared/security/tokens.js';

describe('tokens', () => {
  it('generates unguessable tokens and stores them as 64-char SHA-256 hashes', () => {
    const [a, b] = [generateToken(), generateToken()];

    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe('rate limit', () => {
  it('rejects the attempt after the limit with the seconds to wait', async () => {
    await consume('rl:test', 2, 60);
    await consume('rl:test', 2, 60);

    const err = await consume('rl:test', 2, 60).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(429);
    expect((err as AppError).options.retryAfter).toBeGreaterThan(0);
  });
});

describe('env', () => {
  const valid = {
    APP_URL: 'http://localhost:5173',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'mysql://u:p@localhost:3306/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'x'.repeat(32),
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_USER: '',
    MAIL_FROM: 'Sh2do <no-reply@sh2do.local>',
  };

  it('parses valid variables, treating empty optional ones as absent', () => {
    const env = loadEnv(valid);

    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('refuses to start without a required variable or with a short secret', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
