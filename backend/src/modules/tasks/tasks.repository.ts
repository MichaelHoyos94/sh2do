import { clock } from '../../shared/clock.js';
import { prisma } from '../../shared/db/prisma.js';
import type { TaskPriority, TaskStatus } from './tasks.schemas.js';

const withOccurrence = {
  occurrences: { where: { sequenceNo: 0 } },
  taskTags: { select: { tagId: true } },
} as const;

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
    priority?: TaskPriority;
    tagIds: number[];
    occurrence: OccurrenceData;
  }) =>
    prisma.task.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        taskTags: { create: data.tagIds.map((tagId) => ({ tagId })) },
        occurrences: { create: { sequenceNo: 0, ...data.occurrence } },
      },
      include: withOccurrence,
    }),

  /** Busca por id y dueño a la vez: lo ajeno es indistinguible de lo inexistente. */
  findOwned: (id: number, userId: number) =>
    prisma.task.findFirst({ where: { id, userId }, include: withOccurrence }),

  /** Del id más alto al más bajo, a partir de `cursor` (excluido). OR dentro de cada filtro, AND entre ellos. */
  list: (
    userId: number,
    filters: {
      cursor?: number;
      status?: TaskStatus[];
      priority?: TaskPriority[];
      tagIds?: number[];
    },
    take: number,
  ) =>
    prisma.task.findMany({
      where: {
        userId,
        ...(filters.cursor !== undefined && { id: { lt: filters.cursor } }),
        ...(filters.priority && { priority: { in: filters.priority } }),
        ...(filters.status && {
          occurrences: { some: { sequenceNo: 0, status: { in: filters.status } } },
        }),
        ...(filters.tagIds && { taskTags: { some: { tagId: { in: filters.tagIds } } } }),
      },
      orderBy: { id: 'desc' },
      take,
      include: withOccurrence,
    }),

  /** `tasks.updated_at` se toca siempre. Si viene `tagIds`, sustituye las etiquetas en la misma transacción. */
  update: (
    id: number,
    task: {
      title: string;
      description: string | null;
      priority: TaskPriority;
      tagIds?: number[];
    },
    occurrence: OccurrenceData,
  ) =>
    prisma.$transaction(async (tx) => {
      const { tagIds, ...fields } = task;
      await tx.taskOccurrence.update({
        where: { taskId_sequenceNo: { taskId: id, sequenceNo: 0 } },
        data: occurrence,
      });
      if (tagIds) {
        await tx.taskTag.deleteMany({ where: { taskId: id } });
        await tx.taskTag.createMany({ data: tagIds.map((tagId) => ({ taskId: id, tagId })) });
      }
      return tx.task.update({
        where: { id },
        data: { ...fields, updatedAt: clock.now() },
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
