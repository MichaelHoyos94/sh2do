import { clock } from '../../shared/clock.js';
import { prisma } from '../../shared/db/prisma.js';
import type { TaskStatus } from './tasks.schemas.js';

const withOccurrence = { occurrences: { where: { sequenceNo: 0 } } } as const;

export interface OccurrenceData {
  scheduledDate: Date | null;
  scheduledTime: Date | null;
  timezone: string;
  scheduledAtUtc: Date | null;
}

export const tasksRepository = {
  /** `tasks` y su ocurrencia 0 en un solo create anidado (atómico). */
  create: (data: {
    userId: number;
    title: string;
    description: string | null;
    occurrence: OccurrenceData;
  }) =>
    prisma.task.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description,
        occurrences: { create: { sequenceNo: 0, ...data.occurrence } },
      },
      include: withOccurrence,
    }),

  /** Busca por id y dueño a la vez: lo ajeno es indistinguible de lo inexistente. */
  findOwned: (id: number, userId: number) =>
    prisma.task.findFirst({ where: { id, userId }, include: withOccurrence }),

  /** Del id más alto al más bajo, a partir de `cursor` (excluido). */
  list: (userId: number, cursor: number | undefined, take: number) =>
    prisma.task.findMany({
      where: { userId, ...(cursor !== undefined && { id: { lt: cursor } }) },
      orderBy: { id: 'desc' },
      take,
      include: withOccurrence,
    }),

  /** `tasks.updated_at` se toca siempre, aunque solo cambie la ocurrencia. */
  update: (
    id: number,
    task: { title: string; description: string | null },
    occurrence: OccurrenceData,
  ) =>
    prisma.$transaction(async (tx) => {
      await tx.taskOccurrence.update({
        where: { taskId_sequenceNo: { taskId: id, sequenceNo: 0 } },
        data: occurrence,
      });
      return tx.task.update({
        where: { id },
        data: { ...task, updatedAt: clock.now() },
        include: withOccurrence,
      });
    }),

  /** Estado y `completed_at` de la ocurrencia 0, más `tasks.updated_at`, en una transacción. */
  updateStatus: (id: number, status: TaskStatus, completedAt: Date | null) =>
    prisma.$transaction(async (tx) => {
      await tx.taskOccurrence.update({
        where: { taskId_sequenceNo: { taskId: id, sequenceNo: 0 } },
        data: { status, completedAt },
      });
      return tx.task.update({
        where: { id },
        data: { updatedAt: clock.now() },
        include: withOccurrence,
      });
    }),
};
