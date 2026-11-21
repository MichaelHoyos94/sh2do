import type { Queue } from 'bullmq';
import { clock } from '../shared/clock.js';
import { logger } from '../shared/logger.js';
import { usersService } from '../modules/users/users.service.js';
import { enqueueSendEmail, type SendEmailJob } from '../shared/queue/queues.js';
import { emailDeliveriesRepository as deliveries } from '../shared/mail/email-deliveries.repository.js';

const STALE_AFTER_MS = 60_000;

/**
 * Al arrancar el worker: un delivery `queued` de más de 1 min cuyo job sigue en la cola se deja
 * (BullMQ lo ejecutará). Si el job se perdió:
 * - `password_changed` no lleva token: se reencola con el nombre del usuario.
 * - Los kinds con enlace ya no tienen el token en claro y no se pueden reconstruir: se marcan
 *   `failed` y el usuario puede pedir otro enlace.
 * Devuelve cuántos se marcaron `failed`.
 */
export async function reconcileEmailDeliveries(
  queue: Pick<Queue, 'getJob'>,
  enqueue: (job: SendEmailJob) => Promise<unknown> = enqueueSendEmail,
): Promise<number> {
  const now = clock.now();
  const stale = await deliveries.findQueuedBefore(new Date(now.getTime() - STALE_AFTER_MS));
  let failed = 0;
  for (const delivery of stale) {
    if (await queue.getJob(`email-${delivery.id}`)) continue;
    if (delivery.kind === 'password_changed') {
      const user = await usersService.findById(delivery.userId);
      await enqueue({ deliveryId: delivery.id, displayName: user?.displayName ?? '' });
      continue;
    }
    await deliveries.markError(delivery.id, 'token unavailable', true, now);
    logger.warn({ deliveryId: delivery.id }, 'Email delivery lost its job; marked as failed');
    failed++;
  }
  return failed;
}
