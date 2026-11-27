import type { TaskPriority, TaskStatus } from '@/api/types';
import { PRIORITY_LABELS, STATUS_LABELS } from './format';

export type TaskFilters = { status: TaskStatus[]; priority: TaskPriority[]; tagIds: number[] };

const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as TaskPriority[];

const values = (params: URLSearchParams, key: string) =>
  (params.get(key) ?? '').split(',').filter(Boolean);

/** Lee los filtros de la URL en orden canónico (clave de caché estable); ignora lo desconocido. */
export const readFilters = (params: URLSearchParams): TaskFilters => ({
  status: STATUSES.filter((s) => values(params, 'status').includes(s)),
  priority: PRIORITIES.filter((p) => values(params, 'priority').includes(p)),
  tagIds: [
    ...new Set(
      values(params, 'tagIds')
        .filter((v) => /^[1-9]\d*$/.test(v))
        .map(Number),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, 20),
});

export const hasFilters = (f: TaskFilters) =>
  f.status.length + f.priority.length + f.tagIds.length > 0;

/** Parámetros de la URL (y de la API) con solo los grupos activos. */
export function writeFilters(f: TaskFilters) {
  const params = new URLSearchParams();
  for (const key of ['status', 'priority', 'tagIds'] as const) {
    if (f[key].length > 0) params.set(key, f[key].join(','));
  }
  return params;
}

const LIST_SEARCH_KEY = 'sh2do.tasks.listSearch';

/**
 * Los enlaces de vuelta a la lista (detalle, nuevo, inexistente) conservan los filtros (R-10).
 * Se guarda en la pestaña y no en el estado del router, que se pierde al pasar por editar.
 */
export const rememberListSearch = (search: string) =>
  sessionStorage.setItem(LIST_SEARCH_KEY, search);

export function tasksListPath() {
  const search = sessionStorage.getItem(LIST_SEARCH_KEY);
  return search ? `/tasks?${search}` : '/tasks';
}

/** Añade o quita `value` de un grupo. */
export function toggleFilter<K extends keyof TaskFilters>(
  f: TaskFilters,
  key: K,
  value: TaskFilters[K][number],
): TaskFilters {
  const list = f[key] as (typeof value)[];
  return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
}
