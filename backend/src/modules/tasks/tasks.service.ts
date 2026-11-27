import { Prisma } from '../../generated/prisma/client.js';
import { clock } from '../../shared/clock.js';
import { AppError } from '../../shared/http/problem.js';
import {
  dateColumnToString,
  stringToDateColumn,
  stringToTimeColumn,
  timeColumnToString,
  toUtcInstant,
} from '../../shared/time.js';
import { tagsService } from '../tags/tags.service.js';
import { usersService } from '../users/users.service.js';
import { tasksRepository, type OccurrenceData } from './tasks.repository.js';
import {
  TIME_WITHOUT_DATE_MESSAGE,
  toTaskDto,
  type CreateTaskInput,
  type ListTasksQuery,
  type TaskWithOccurrence,
  type TaskStatus,
  type UpdateTaskInput,
} from './tasks.schemas.js';

const notFound = () => new AppError('NOT_FOUND', 'Este pendiente no existe.');

/** La zona del usuario manda sobre la fecha y la hora (R-04). */
async function getUserTimezone(userId: number) {
  const timezone = await usersService.getTimezone(userId);
  if (!timezone) throw new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.');
  return timezone;
}

function buildOccurrence(
  date: string | null,
  time: string | null,
  timezone: string,
): OccurrenceData {
  return {
    scheduledDate: stringToDateColumn(date),
    scheduledTime: stringToTimeColumn(time),
    timezone,
    scheduledAtUtc: toUtcInstant(date, time, timezone),
  };
}

function assertTimeHasDate(date: string | null, time: string | null) {
  if (time && !date) {
    throw new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', {
      errors: [{ field: 'scheduledTime', message: TIME_WITHOUT_DATE_MESSAGE }],
    });
  }
}

const TAGS_NOT_FOUND = 'Alguna de las etiquetas elegidas no existe.';
const tagsNotFound = () =>
  new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', {
    errors: [{ field: 'tagIds', message: TAGS_NOT_FOUND }],
  });

/** Ajena e inexistente dan el mismo 422: no se revela cuál ni por qué (R-03). */
async function assertOwnedTags(userId: number, tagIds: number[] | undefined) {
  if (!tagIds?.length) return;
  if ((await tagsService.findOwnedIds(userId, tagIds)).length !== tagIds.length)
    throw tagsNotFound();
}

/** Una etiqueta eliminada entre la validación y la escritura rompe la FK (R-05). */
async function writeTags<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw tagsNotFound();
    }
    throw err;
  }
}

/** DTOs de una página con una sola consulta de nombres de etiquetas. */
async function toDtos(userId: number, tasks: TaskWithOccurrence[]) {
  const ids = [...new Set(tasks.flatMap((t) => t.taskTags.map((tt) => tt.tagId)))];
  const tags = ids.length ? await tagsService.getOwnedByIds(userId, ids) : [];
  return tasks.map((t) => toTaskDto(t, tags));
}

const toDto = async (userId: number, task: TaskWithOccurrence) =>
  (await toDtos(userId, [task]))[0]!;

export const tasksService = {
  async create(userId: number, input: CreateTaskInput) {
    const timezone = await getUserTimezone(userId);
    const tagIds = input.tagIds ?? [];
    await assertOwnedTags(userId, tagIds);
    const task = await writeTags(() =>
      tasksRepository.create({
        userId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        tagIds,
        occurrence: buildOccurrence(
          input.scheduledDate ?? null,
          input.scheduledTime ?? null,
          timezone,
        ),
      }),
    );
    return toDto(userId, task);
  },

  async list(userId: number, query: ListTasksQuery) {
    // Se pide una fila de más para saber si hay otra página.
    const { limit, ...filters } = query;
    const rows = await tasksRepository.list(userId, filters, limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await toDtos(userId, page),
      nextCursor: hasMore ? String(page[page.length - 1]!.id) : null,
    };
  },

  async getOwned(userId: number, taskId: number) {
    const task = await tasksRepository.findOwned(taskId, userId);
    if (!task) throw notFound();
    return toDto(userId, task);
  },

  async update(userId: number, taskId: number, input: UpdateTaskInput) {
    const current = await tasksRepository.findOwned(taskId, userId);
    if (!current) throw notFound();
    const occurrence = current.occurrences[0]!;

    const currentDate = dateColumnToString(occurrence.scheduledDate);
    const currentTime = timeColumnToString(occurrence.scheduledTime);

    const date = input.scheduledDate !== undefined ? input.scheduledDate : currentDate;
    // Quitar la fecha quita también la hora, salvo que el body envíe una hora (y entonces falla abajo).
    const time =
      input.scheduledTime !== undefined
        ? input.scheduledTime
        : input.scheduledDate === null
          ? null
          : currentTime;
    assertTimeHasDate(date, time);

    const title = input.title ?? current.title;
    const description = input.description !== undefined ? input.description : current.description;
    const scheduleChanged = date !== currentDate || time !== currentTime;
    const priority = input.priority ?? current.priority;

    await assertOwnedTags(userId, input.tagIds);
    const currentTagIds = new Set(current.taskTags.map((t) => t.tagId));
    // El conjunto, sin importar el orden (R-06).
    const tagsChanged =
      input.tagIds !== undefined &&
      (input.tagIds.length !== currentTagIds.size ||
        !input.tagIds.every((id) => currentTagIds.has(id)));

    // Sin cambios reales (p. ej. body vacío): no se escribe nada ni se toca updated_at.
    if (
      title === current.title &&
      description === current.description &&
      priority === current.priority &&
      !tagsChanged &&
      !scheduleChanged
    ) {
      return toDto(userId, current);
    }

    const next: OccurrenceData = scheduleChanged
      ? buildOccurrence(date, time, await getUserTimezone(userId))
      : {
          scheduledDate: occurrence.scheduledDate,
          scheduledTime: occurrence.scheduledTime,
          timezone: occurrence.timezone,
          scheduledAtUtc: occurrence.scheduledAtUtc,
        };

    const updated = await writeTags(() =>
      tasksRepository.update(
        taskId,
        { title, description, priority, tagIds: tagsChanged ? input.tagIds : undefined },
        next,
      ),
    );
    return toDto(userId, updated);
  },

  /** Transiciones libres (RN-PEN-2). `completed_at` solo existe mientras está completado. */
  async setStatus(userId: number, taskId: number, status: TaskStatus) {
    const current = await tasksRepository.findOwned(taskId, userId);
    if (!current) throw notFound();
    // Mismo estado: no se escribe nada ni se toca updated_at.
    if (current.occurrences[0]!.status === status) return toDto(userId, current);

    const completedAt = status === 'completed' ? clock.now() : null;
    return toDto(userId, await tasksRepository.updateStatus(taskId, status, completedAt));
  },
};
