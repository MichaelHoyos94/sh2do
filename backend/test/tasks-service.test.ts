import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { tagsService } from '../src/modules/tags/tags.service.js';
import { tasksRepository } from '../src/modules/tasks/tasks.repository.js';
import { tasksService } from '../src/modules/tasks/tasks.service.js';
import { usersService } from '../src/modules/users/users.service.js';

// R-05: la etiqueta se borra entre validarla y escribir; la FK falla (P2003) y se responde el 422 de tagIds.
describe('tasksService when a tag disappears between validation and write', () => {
  const fkError = () =>
    new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
  const expectTagsError = (promise: Promise<unknown>) =>
    expect(promise).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      options: {
        errors: [{ field: 'tagIds', message: 'Alguna de las etiquetas elegidas no existe.' }],
      },
    });

  it('CA-04: create answers the tagIds 422 on P2003', async () => {
    vi.spyOn(usersService, 'getTimezone').mockResolvedValue('America/Bogota');
    vi.spyOn(tagsService, 'findOwnedIds').mockResolvedValue([5]);
    vi.spyOn(tasksRepository, 'create').mockRejectedValue(fkError());

    await expectTagsError(tasksService.create(1, { title: 'T', tagIds: [5] }));
  });

  it('CA-04: update answers the tagIds 422 on P2003', async () => {
    vi.spyOn(tagsService, 'findOwnedIds').mockResolvedValue([5]);
    vi.spyOn(tasksRepository, 'findOwned').mockResolvedValue({
      id: 1,
      title: 'T',
      description: null,
      priority: 'medium',
      taskTags: [],
      occurrences: [{ sequenceNo: 0, scheduledDate: null, scheduledTime: null }],
    } as never);
    vi.spyOn(tasksRepository, 'update').mockRejectedValue(fkError());

    await expectTagsError(tasksService.update(1, 1, { tagIds: [5] }));
  });
});
