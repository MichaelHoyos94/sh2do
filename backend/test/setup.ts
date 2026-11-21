import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { prisma } from '../src/shared/db/prisma.js';
import { redis } from '../src/shared/redis.js';

// La cola real necesita Redis/BullMQ: en las pruebas de API se sustituye por un stub.
vi.mock('../src/shared/queue/queues.js', () => ({ enqueueSendEmail: vi.fn() }));

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.emailDelivery.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.user.deleteMany();
  await redis.flushdb();
});

afterEach(() => {
  vi.restoreAllMocks(); // devuelve el reloj real tras vi.spyOn(clock, 'now')
});

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});
