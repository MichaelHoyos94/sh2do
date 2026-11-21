import { authService } from '../modules/auth/auth.service.js';
import { clock } from '../shared/clock.js';
import { env } from '../shared/config/env.js';
import { emailDeliveriesRepository as deliveries } from '../shared/mail/email-deliveries.repository.js';
import type { MailTransport } from '../shared/mail/mailer.js';
import { verifyEmailTemplate } from '../shared/mail/templates/verify-email.js';
import { logger } from '../shared/logger.js';
import type { SendEmailJob } from '../shared/queue/queues.js';

/** Lo que usamos de un Job de BullMQ. */
export interface EmailJob {
  data: SendEmailJob;
  attemptsMade: number;
  opts: { attempts?: number };
}

export async function processEmailJob(job: EmailJob, transport: MailTransport): Promise<void> {
  const delivery = await deliveries.findById(job.data.deliveryId);
  // Idempotencia: solo se envía un delivery que sigue en `queued`.
  if (delivery?.status !== 'queued') return;

  // Vigencia: un reenvío o la verificación ya hecha dejan este enlace obsoleto; no se envía.
  if (delivery.kind === 'verify_email') {
    const tokenId = Number(delivery.dedupeKey.split(':')[1]);
    if (!(await authService.isVerificationLinkCurrent(tokenId))) {
      await deliveries.markError(delivery.id, 'superseded', true, clock.now());
      return;
    }
  }

  await deliveries.incrementAttempt(delivery.id);
  try {
    if (delivery.kind !== 'verify_email')
      throw new Error(`Unsupported email kind: ${delivery.kind}`);
    const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(job.data.token)}`;
    const mail = verifyEmailTemplate({ displayName: job.data.displayName, url });
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
