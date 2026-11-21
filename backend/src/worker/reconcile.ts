import type { Queue } from 'bullmq';
import { clock } from '../shared/clock.js';
import { logger } from '../shared/logger.js';
import { emailDeliveriesRepository as deliveries } from '../shared/mail/email-deliveries.repository.js';

const STALE_AFTER_MS = 60_000;

/**
 * Al arrancar el worker: un delivery `queued` de más de 1 min cuyo job sigue en la cola se deja
 * (BullMQ lo ejecutará). Si el job se perdió, el token en claro ya no existe y no se puede
 * reconstruir el enlace: se marca `failed` y el usuario puede pedir un reenvío.
 */
export async function reconcileEmailDeliveries(queue: Pick<Queue, 'getJob'>): Promise<number> {
  const now = clock.now();
  const stale = await deliveries.findQueuedBefore(new Date(now.getTime() - STALE_AFTER_MS));
  let failed = 0;
  for (const delivery of stale) {
    if (await queue.getJob(`email-${delivery.id}`)) continue;
    await deliveries.markError(delivery.id, 'token unavailable', true, now);
    logger.warn({ deliveryId: delivery.id }, 'Email delivery lost its job; marked as failed');
    failed++;
  }
  return failed;
}
