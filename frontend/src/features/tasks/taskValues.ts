import type { Task, TaskPriority, UpdateTaskRequest } from '@/api/types';

/** Valores ya normalizados (recortados, `null` en lo vacío) que el formulario entrega a la página. */
export type TaskValues = {
  title: string;
  description: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  priority: TaskPriority;
  tagIds: number[];
};

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const TAGS_MAX = 20;

/** PATCH parcial: solo los campos que cambiaron (`null` borra). */
export function diffTask(initial: Task, values: TaskValues): UpdateTaskRequest {
  const changes: UpdateTaskRequest = {};
  if (values.title !== initial.title) changes.title = values.title;
  if (values.description !== initial.description) changes.description = values.description;
  if (values.scheduledDate !== initial.scheduledDate) changes.scheduledDate = values.scheduledDate;
  if (values.scheduledTime !== initial.scheduledTime) changes.scheduledTime = values.scheduledTime;
  if (values.priority !== initial.priority) changes.priority = values.priority;
  const before = new Set(initial.tags.map((tag) => tag.id));
  if (values.tagIds.length !== before.size || values.tagIds.some((id) => !before.has(id)))
    changes.tagIds = values.tagIds;
  return changes;
}
