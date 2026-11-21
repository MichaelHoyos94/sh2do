import { env } from '../shared/config/env.js';
import { prisma } from '../shared/db/prisma.js';
import { logger } from '../shared/logger.js';
import { createApp } from './app.js';

const server = createApp().listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'API listening');
});

const shutdown = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
