import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { dateColumnToString, timeColumnToString } from '../../shared/time.js';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_INT = 2_147_483_647; // el id es INT en MySQL

/** Pendiente con su ocurrencia 0 (la única que existe hasta STD-12) y los ids de sus etiquetas. */
export type TaskWithOccurrence = Prisma.TaskGetPayload<{
  include: { occurrences: true; taskTags: { select: { tagId: true } } };
}>;

const title = z
  .string({ error: 'El título es obligatorio.' })
  .trim()
  .min(1, 'El título es obligatorio.')
  .max(TITLE_MAX, `El título no puede superar los ${TITLE_MAX} caracteres.`);

// Una descripción vacía tras recortar se guarda como null (R-02).
const description = z
  .string({ error: 'La descripción debe ser texto.' })
  .trim()
  .max(DESCRIPTION_MAX, `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres.`)
  .nullable()
  .transform((v) => (v === '' ? null : v));

const isCalendarDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const scheduledDate = z
  .string({ error: 'La fecha debe ser texto con formato AAAA-MM-DD.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha con formato AAAA-MM-DD.')
  .refine(isCalendarDate, 'Esa fecha no existe en el calendario.')
  .nullable();

const scheduledTime = z
  .string({ error: 'La hora debe ser texto con formato HH:mm.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora con formato HH:mm (24 horas).')
  .nullable();

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const MAX_TAGS_PER_TASK = 20;

const priority = z.enum(TASK_PRIORITIES, { error: 'Elige una prioridad válida.' });

// Un solo error en el campo `tagIds` (no por elemento), con el mensaje del contrato.
const tagIds = z
  .array(z.unknown(), { error: 'Las etiquetas deben ser una lista de ids.' })
  .check((ctx) => {
    const ids = ctx.value;
    const message =
      ids.length > MAX_TAGS_PER_TASK
        ? `Un pendiente admite como máximo ${MAX_TAGS_PER_TASK} etiquetas.`
        : !ids.every(
              (id) => Number.isInteger(id) && (id as number) >= 1 && (id as number) <= MAX_INT,
            )
          ? 'Los ids de etiquetas deben ser enteros positivos.'
          : new Set(ids).size !== ids.length
            ? 'No repitas etiquetas.'
            : null;
    if (message) ctx.issues.push({ code: 'custom', input: ids, message });
  })
  .transform((ids) => ids as number[]);

export const TIME_WITHOUT_DATE_MESSAGE = 'Pon una fecha para poder elegir la hora.';

export const createTaskSchema = z
  .strictObject({
    title,
    description: description.optional(),
    scheduledDate: scheduledDate.optional(),
    scheduledTime: scheduledTime.optional(),
    priority: priority.optional(),
    tagIds: tagIds.optional(),
  })
  .check((ctx) => {
    if (ctx.value.scheduledTime && !ctx.value.scheduledDate) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        path: ['scheduledTime'],
        message: TIME_WITHOUT_DATE_MESSAGE,
      });
    }
  });
export type CreateTaskInput = z.output<typeof createTaskSchema>;

// Todos opcionales: "no hay hora sin fecha" se valida en el servicio sobre el resultado de la mezcla.
export const updateTaskSchema = z.strictObject({
  title: title.optional(),
  description: description.optional(),
  scheduledDate: scheduledDate.optional(),
  scheduledTime: scheduledTime.optional(),
  priority: priority.optional(),
  tagIds: tagIds.optional(),
});
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

export const setTaskStatusSchema = z.strictObject({
  status: z.enum(TASK_STATUSES, { error: 'Elige un estado válido.' }),
});

const positiveInt = (message: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,9}$/, message)
    .transform(Number)
    .pipe(z.number().max(MAX_INT, message));

const limitMessage = `El límite debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`;

/** Lista separada por comas → array; cualquier valor inválido es un único error en el parámetro. */
const csv = <T>(parse: (item: string) => T | undefined, message: string, max = Infinity) =>
  z.string({ error: message }).transform((raw, ctx) => {
    const items = raw.split(',').map(parse);
    if (items.length > max || items.some((i) => i === undefined)) {
      ctx.issues.push({ code: 'custom', input: raw, message });
      return z.NEVER;
    }
    return items as T[];
  });

export const listTasksQuerySchema = z.strictObject({
  status: csv((s) => z.enum(TASK_STATUSES).safeParse(s).data, 'Elige estados válidos.').optional(),
  priority: csv(
    (s) => z.enum(TASK_PRIORITIES).safeParse(s).data,
    'Elige prioridades válidas.',
  ).optional(),
  tagIds: csv(
    (s) => positiveInt('').safeParse(s).data,
    `Elige entre 1 y ${MAX_TAGS_PER_TASK} etiquetas válidas.`,
    MAX_TAGS_PER_TASK,
  ).optional(),
  cursor: positiveInt('El cursor no es válido.').optional(),
  limit: z
    .string()
    .regex(/^\d+$/, limitMessage)
    .transform(Number)
    .pipe(z.number().min(1, limitMessage).max(MAX_PAGE_SIZE, limitMessage))
    .default(DEFAULT_PAGE_SIZE),
});
export type ListTasksQuery = z.output<typeof listTasksQuerySchema>;

export const taskIdParamSchema = positiveInt('Este pendiente no existe.');

export interface TaskDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: { id: number; name: string }[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** Aplana la ocurrencia 0 (la API no expone ocurrencias en esta feature). `tags` son las del grupo, ya en orden alfabético. */
export function toTaskDto(task: TaskWithOccurrence, tags: { id: number; name: string }[]): TaskDto {
  const own = new Set(task.taskTags.map((t) => t.tagId));
  const occurrence = task.occurrences.find((o) => o.sequenceNo === 0);
  if (!occurrence) throw new Error(`Task ${task.id} has no occurrence 0`);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: occurrence.status,
    priority: task.priority,
    tags: tags.filter((t) => own.has(t.id)),
    scheduledDate: dateColumnToString(occurrence.scheduledDate),
    scheduledTime: timeColumnToString(occurrence.scheduledTime),
    timezone: occurrence.timezone,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
