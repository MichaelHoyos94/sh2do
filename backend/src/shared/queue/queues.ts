import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const EMAIL_QUEUE = 'email';

/** El token en claro solo viaja aquí; se descarta al terminar el job (no se guarda en MySQL). */
export interface SendEmailJob {
  deliveryId: number;
  /** Solo los correos con enlace (verificación y recuperación) llevan token. */
  token?: string;
  displayName: string;
}

// BullMQ exige maxRetriesPerRequest = null en su conexión.
export const createBullConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const emailQueue = new Queue<SendEmailJob>(EMAIL_QUEUE, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: 4, // 1 intento + 3 reintentos
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
});

/** Debe llamarse DESPUÉS de confirmar el registro durable en MySQL. */
export const enqueueSendEmail = (job: SendEmailJob) =>
  // BullMQ no admite ids numéricos; el id evita duplicar el job de un mismo delivery.
  emailQueue.add('send-email', job, { jobId: `email-${job.deliveryId}` });
