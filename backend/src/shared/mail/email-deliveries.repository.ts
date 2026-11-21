import type { EmailKind } from '../../generated/prisma/client.js';
import { prisma, type Db } from '../db/prisma.js';

// Tabla compartida entre la API (crea el registro) y el worker (lo actualiza).
export const emailDeliveriesRepository = {
  create: (
    data: { userId: number; kind: EmailKind; recipientEmail: string; dedupeKey: string },
    db: Db = prisma,
  ) => db.emailDelivery.create({ data }),

  findById: (id: number) => prisma.emailDelivery.findUnique({ where: { id } }),

  /** Cada intento incrementa attempt_count, también los que fallan. */
  incrementAttempt: (id: number) =>
    prisma.emailDelivery.update({ where: { id }, data: { attemptCount: { increment: 1 } } }),

  markAccepted: (id: number, providerMessageId: string, processedAt: Date) =>
    prisma.emailDelivery.update({
      where: { id },
      data: { status: 'accepted', providerMessageId, processedAt, lastError: null },
    }),

  /** Con `final = false` el envío sigue en `queued` esperando el reintento. */
  markError: (id: number, lastError: string, final: boolean, processedAt: Date) =>
    prisma.emailDelivery.update({
      where: { id },
      data: final ? { status: 'failed', lastError, processedAt } : { lastError },
    }),

  findQueuedBefore: (before: Date) =>
    prisma.emailDelivery.findMany({ where: { status: 'queued', createdAt: { lt: before } } }),
};
