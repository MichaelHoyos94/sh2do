import type { EmailKind } from '../generated/prisma/client.js';
import { authService } from '../modules/auth/auth.service.js';
import { clock } from '../shared/clock.js';
import { env } from '../shared/config/env.js';
import { emailDeliveriesRepository as deliveries } from '../shared/mail/email-deliveries.repository.js';
import { passwordChangedTemplate } from '../shared/mail/templates/password-changed.js';
import { resetPasswordTemplate } from '../shared/mail/templates/reset-password.js';
import { verifyEmailTemplate } from '../shared/mail/templates/verify-email.js';
import { logger } from '../shared/logger.js';
import type { MailMessage, MailTransport } from '../shared/mail/mailer.js';
import type { SendEmailJob } from '../shared/queue/queues.js';

/** Lo que usamos de un Job de BullMQ. */
export interface EmailJob {
  data: SendEmailJob;
  attemptsMade: number;
  opts: { attempts?: number };
}

const linkTo = (path: string, token: string | undefined) => {
  if (!token) throw new Error('Missing token in email job');
  return `${env.APP_URL}/${path}?token=${encodeURIComponent(token)}`;
};

function buildMail(kind: EmailKind, { token, displayName }: SendEmailJob): Omit<MailMessage, 'to'> {
  switch (kind) {
    case 'verify_email':
      return verifyEmailTemplate({ displayName, url: linkTo('verify-email', token) });
    case 'reset_password':
      return resetPasswordTemplate({ displayName, url: linkTo('reset-password', token) });
    case 'password_changed':
      return passwordChangedTemplate({ displayName });
    default:
      throw new Error(`Unsupported email kind: ${kind}`);
  }
}

export async function processEmailJob(job: EmailJob, transport: MailTransport): Promise<void> {
  const delivery = await deliveries.findById(job.data.deliveryId);
  // Idempotencia: solo se envía un delivery que sigue en `queued`.
  if (delivery?.status !== 'queued') return;

  // Vigencia: un reenvío, una solicitud nueva o el trámite ya hecho dejan el enlace obsoleto; no se envía.
  const tokenId = Number(delivery.dedupeKey.split(':')[1]);
  const isCurrent =
    delivery.kind === 'verify_email'
      ? await authService.isVerificationLinkCurrent(tokenId)
      : delivery.kind === 'reset_password'
        ? await authService.isPasswordResetLinkCurrent(tokenId)
        : true;
  if (!isCurrent) {
    await deliveries.markError(delivery.id, 'superseded', true, clock.now());
    return;
  }

  await deliveries.incrementAttempt(delivery.id);
  try {
    const mail = buildMail(delivery.kind, job.data);
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: delivery.recipientEmail,
      ...mail,
    });
    await deliveries.markAccepted(delivery.id, info.messageId, clock.now());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await deliveries.markError(delivery.id, message, isFinalAttempt, clock.now());
    logger.error(
      { deliveryId: delivery.id, kind: delivery.kind, isFinalAttempt, err: message },
      'Email delivery failed',
    );
    throw err; // BullMQ programa el reintento con espera exponencial
  }
}
