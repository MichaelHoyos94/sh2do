import { clock } from '../../shared/clock.js';
import { AppError } from '../../shared/http/problem.js';
import {
  dateColumnToString,
  stringToDateColumn,
  stringToTimeColumn,
  timeColumnToString,
  toUtcInstant,
} from '../../shared/time.js';
import { usersService } from '../users/users.service.js';
import { tasksRepository, type OccurrenceData } from './tasks.repository.js';
import {
  TIME_WITHOUT_DATE_MESSAGE,
  toTaskDto,
  type CreateTaskInput,
  type ListTasksQuery,
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

export const tasksService = {
  async create(userId: number, input: CreateTaskInput) {
    const timezone = await getUserTimezone(userId);
    const task = await tasksRepository.create({
      userId,
      title: input.title,
      description: input.description ?? null,
      occurrence: buildOccurrence(
        input.scheduledDate ?? null,
        input.scheduledTime ?? null,
        timezone,
      ),
    });
    return toTaskDto(task);
  },

  async list(userId: number, query: ListTasksQuery) {
    // Se pide una fila de más para saber si hay otra página.
    const rows = await tasksRepository.list(userId, query.cursor, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map(toTaskDto),
      nextCursor: hasMore ? String(page[page.length - 1]!.id) : null,
    };
  },

  async getOwned(userId: number, taskId: number) {
    const task = await tasksRepository.findOwned(taskId, userId);
    if (!task) throw notFound();
    return toTaskDto(task);
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

    // Sin cambios reales (p. ej. body vacío): no se escribe nada ni se toca updated_at.
    if (title === current.title && description === current.description && !scheduleChanged) {
      return toTaskDto(current);
    }

    const next: OccurrenceData = scheduleChanged
      ? buildOccurrence(date, time, await getUserTimezone(userId))
      : {
          scheduledDate: occurrence.scheduledDate,
          scheduledTime: occurrence.scheduledTime,
          timezone: occurrence.timezone,
          scheduledAtUtc: occurrence.scheduledAtUtc,
        };

    return toTaskDto(await tasksRepository.update(taskId, { title, description }, next));
  },

  /** Transiciones libres (RN-PEN-2). `completed_at` solo existe mientras está completado. */
  async setStatus(userId: number, taskId: number, status: TaskStatus) {
    const current = await tasksRepository.findOwned(taskId, userId);
    if (!current) throw notFound();
    // Mismo estado: no se escribe nada ni se toca updated_at.
    if (current.occurrences[0]!.status === status) return toTaskDto(current);

    const completedAt = status === 'completed' ? clock.now() : null;
    return toTaskDto(await tasksRepository.updateStatus(taskId, status, completedAt));
  },
};
