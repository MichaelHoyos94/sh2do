import { describe, expect, it, vi } from 'vitest';
import { clock } from '../src/shared/clock.js';
import { prisma } from '../src/shared/db/prisma.js';
import type { MailTransport } from '../src/shared/mail/mailer.js';
import { processEmailJob, type EmailJob } from '../src/worker/email.processor.js';
import { reconcileEmailDeliveries } from '../src/worker/reconcile.js';

async function createDelivery(createdAt = new Date()) {
  const user = await prisma.user.create({
    data: { email: 'ana@example.com', passwordHash: 'x', displayName: 'Ana', timezone: 'UTC' },
  });
  const token = await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: 'h'.repeat(64),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const delivery = await prisma.emailDelivery.create({
    data: {
      userId: user.id,
      kind: 'verify_email',
      recipientEmail: user.email,
      dedupeKey: `verify_email:${token.id}`,
      createdAt,
    },
  });
  return Object.assign(delivery, { tokenId: token.id });
}

const jobFor = (deliveryId: number, attemptsMade = 0): EmailJob => ({
  data: { deliveryId, token: 'abc123', displayName: 'Ana' },
  attemptsMade,
  opts: { attempts: 4 },
});

const failingTransport = (): MailTransport => ({
  sendMail: vi.fn().mockRejectedValue(new Error('smtp down')),
});

describe('processEmailJob', () => {
  it('sends the verification link and marks the delivery as accepted', async () => {
    const delivery = await createDelivery();
    const transport: MailTransport = {
      sendMail: vi.fn().mockResolvedValue({ messageId: '<msg-1@mailpit>' }),
    };

    await processEmailJob(jobFor(delivery.id), transport);

    const sent = vi.mocked(transport.sendMail).mock.calls[0]![0];
    expect(sent.to).toBe('ana@example.com');
    expect(sent.subject).toBe('Verifica tu correo en Sh2do');
    expect(sent.text).toContain('/verify-email?token=abc123');
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({
      status: 'accepted',
      attemptCount: 1,
      providerMessageId: '<msg-1@mailpit>',
    });
  });

  it('keeps the delivery queued for a retry and fails it on the last attempt', async () => {
    const delivery = await createDelivery();

    await expect(processEmailJob(jobFor(delivery.id, 0), failingTransport())).rejects.toThrow(
      'smtp down',
    );
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({
      status: 'queued',
      attemptCount: 1,
      lastError: 'smtp down',
    });

    await expect(processEmailJob(jobFor(delivery.id, 3), failingTransport())).rejects.toThrow(
      'smtp down',
    );
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({
      status: 'failed',
      attemptCount: 2,
    });
  });

  it('does nothing for a delivery that is no longer queued (idempotent)', async () => {
    const delivery = await createDelivery();
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: 'accepted' } });
    const transport = failingTransport();

    await processEmailJob(jobFor(delivery.id), transport);

    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe('processEmailJob: link no longer current', () => {
  it.each([
    [
      'the link was voided or used',
      (d: { tokenId: number }) =>
        prisma.emailVerificationToken.update({
          where: { id: d.tokenId },
          data: { usedAt: new Date() },
        }),
    ],
    [
      'the user already verified the email',
      (d: { userId: number }) =>
        prisma.user.update({ where: { id: d.userId }, data: { emailVerifiedAt: new Date() } }),
    ],
  ])('does not send and marks the delivery as superseded when %s', async (_name, invalidate) => {
    const delivery = await createDelivery();
    await invalidate(delivery);
    const transport = failingTransport();

    await processEmailJob(jobFor(delivery.id), transport);

    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({
      status: 'failed',
      lastError: 'superseded',
      attemptCount: 0,
    });
  });
});

describe('reconcileEmailDeliveries', () => {
  it('leaves a stale delivery whose job still exists and fails the one that lost its job', async () => {
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    const withJob = await createDelivery(stale);
    const queue = {
      getJob: vi.fn(async (id: string) => (id === `email-${withJob.id}` ? {} : undefined)),
    };

    expect(await reconcileEmailDeliveries(queue as never)).toBe(0);

    queue.getJob.mockResolvedValue(undefined);
    expect(await reconcileEmailDeliveries(queue as never)).toBe(1);
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: withJob.id } }),
    ).toMatchObject({
      status: 'failed',
      lastError: 'token unavailable',
    });
  });

  it('ignores deliveries younger than one minute', async () => {
    await createDelivery(clock.now());
    const queue = { getJob: vi.fn() };

    expect(await reconcileEmailDeliveries(queue as never)).toBe(0);
    expect(queue.getJob).not.toHaveBeenCalled();
  });
});

async function createResetDelivery(
  kind: 'reset_password' | 'password_changed',
  createdAt = new Date(),
) {
  const user = await prisma.user.create({
    data: { email: 'ana@example.com', passwordHash: 'x', displayName: 'Ana', timezone: 'UTC' },
  });
  const token = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: 'r'.repeat(64),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const delivery = await prisma.emailDelivery.create({
    data: {
      userId: user.id,
      kind,
      recipientEmail: user.email,
      dedupeKey: `${kind}:${token.id}`,
      createdAt,
    },
  });
  return Object.assign(delivery, { tokenId: token.id });
}

const okTransport = () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: '<m@mailpit>' }) });

describe('processEmailJob: password recovery emails', () => {
  it('CA-01: sends the reset link', async () => {
    const delivery = await createResetDelivery('reset_password');
    const transport = okTransport();

    await processEmailJob(jobFor(delivery.id), transport);

    const sent = transport.sendMail.mock.calls[0]![0];
    expect(sent.subject).toBe('Restablece tu contraseña de Sh2do');
    expect(sent.text).toContain('/reset-password?token=abc123');
    expect(
      (await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe('accepted');
  });

  it('CA-03: does not send a reset link that was voided and marks it as superseded', async () => {
    const delivery = await createResetDelivery('reset_password');
    await prisma.passwordResetToken.update({
      where: { id: delivery.tokenId },
      data: { usedAt: new Date() },
    });
    const transport = okTransport();

    await processEmailJob(jobFor(delivery.id), transport);

    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({ status: 'failed', lastError: 'superseded' });
  });

  it('CA-09: sends the password changed notice without a link or a token', async () => {
    const delivery = await createResetDelivery('password_changed');
    const transport = okTransport();

    await processEmailJob(
      { ...jobFor(delivery.id), data: { deliveryId: delivery.id, displayName: 'Ana' } },
      transport,
    );

    const sent = transport.sendMail.mock.calls[0]![0];
    expect(sent.subject).toBe('Tu contraseña de Sh2do cambió');
    expect(sent.text).not.toContain('http');
    expect(sent.html).not.toContain('<a ');
  });

  it('fails a link email whose job carries no token', async () => {
    const delivery = await createResetDelivery('reset_password');

    await expect(
      processEmailJob(
        { ...jobFor(delivery.id), data: { deliveryId: delivery.id, displayName: 'Ana' } },
        okTransport(),
      ),
    ).rejects.toThrow('Missing token');
  });
});

describe('reconcileEmailDeliveries: password changed notice', () => {
  it('CA-09: requeues a password_changed delivery that lost its job instead of failing it', async () => {
    const delivery = await createResetDelivery(
      'password_changed',
      new Date(Date.now() - 5 * 60_000),
    );
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const failed = await reconcileEmailDeliveries({ getJob: vi.fn() } as never, enqueue);

    expect(failed).toBe(0);
    expect(enqueue).toHaveBeenCalledWith({ deliveryId: delivery.id, displayName: 'Ana' });
    expect(
      (await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe('queued');
  });

  it('still fails a reset_password delivery that lost its job', async () => {
    const delivery = await createResetDelivery('reset_password', new Date(Date.now() - 5 * 60_000));
    const enqueue = vi.fn();

    expect(await reconcileEmailDeliveries({ getJob: vi.fn() } as never, enqueue)).toBe(1);

    expect(enqueue).not.toHaveBeenCalled();
    expect(
      await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({ status: 'failed', lastError: 'token unavailable' });
  });
});
