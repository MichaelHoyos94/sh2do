import { describe, expect, it, vi } from 'vitest';

describe('enqueueSendEmail', () => {
  it('uses email-<deliveryId> as the job id so a delivery is never queued twice', async () => {
    // setup.ts sustituye el módulo; aquí se prueba el real con la cola espiada.
    const queues = await vi.importActual<typeof import('../src/shared/queue/queues.js')>(
      '../src/shared/queue/queues.js',
    );
    const add = vi.spyOn(queues.emailQueue, 'add').mockResolvedValue({} as never);
    const job = { deliveryId: 7, token: 't', displayName: 'Ana' };

    await queues.enqueueSendEmail(job);

    expect(add).toHaveBeenCalledWith('send-email', job, { jobId: 'email-7' });
    await queues.emailQueue.close();
  });
});
