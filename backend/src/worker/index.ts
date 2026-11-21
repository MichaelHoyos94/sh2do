import { Worker } from 'bullmq';
import { createSmtpTransport } from '../shared/mail/mailer.js';
import { logger } from '../shared/logger.js';
import {
  EMAIL_QUEUE,
  createBullConnection,
  emailQueue,
  type SendEmailJob,
} from '../shared/queue/queues.js';
import { prisma } from '../shared/db/prisma.js';
import { processEmailJob } from './email.processor.js';
import { reconcileEmailDeliveries } from './reconcile.js';

const transport = createSmtpTransport();

const worker = new Worker<SendEmailJob>(EMAIL_QUEUE, (job) => processEmailJob(job, transport), {
  connection: createBullConnection(),
  concurrency: 5,
});
worker.on('failed', (job, err) =>
  logger.error({ jobId: job?.id, err: err.message }, 'Email job failed'),
);

await reconcileEmailDeliveries(emailQueue);
logger.info('Worker started');

const shutdown = async () => {
  await worker.close();
  await emailQueue.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
