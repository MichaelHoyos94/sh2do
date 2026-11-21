import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireVerifiedEmail } from '../src/modules/auth/require-verified-email.middleware.js';
import { usersService } from '../src/modules/users/users.service.js';
import { AppError } from '../src/shared/http/problem.js';
import { hashPassword } from '../src/shared/security/password.js';

// CA-12: STD-22 aplicará este middleware al endpoint de asistencia.
async function run(emailVerifiedAt: Date | null) {
  const user = await usersService.create({
    email: 'ana@example.com',
    passwordHash: await hashPassword('correct horse battery'),
    displayName: 'Ana',
    timezone: 'UTC',
  });
  if (emailVerifiedAt) await usersService.markEmailVerified(user.id, emailVerifiedAt);
  const next = vi.fn();
  await requireVerifiedEmail({ user: { id: user.id } } as Request, {} as Response, next);
  return next;
}

describe('requireVerifiedEmail', () => {
  it('CA-12: blocks an unverified user with 403 EMAIL_NOT_VERIFIED', async () => {
    const next = await run(null);

    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
  });

  it('CA-12: lets a verified user through', async () => {
    const next = await run(new Date());

    expect(next).toHaveBeenCalledWith();
  });

  it('answers 401 when there is no authenticated user', async () => {
    const next = vi.fn();

    await requireVerifiedEmail({} as Request, {} as Response, next);

    expect(next.mock.calls[0]![0]).toMatchObject({ status: 401 });
  });
});
