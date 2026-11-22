import type { Task, TaskPriority, TaskStatus } from '@/api/types';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completado',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const dateFormat = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** La fecha ya es local del usuario: se formatea como fecha de calendario, sin pasar por la zona del navegador. */
export function formatSchedule({
  scheduledDate,
  scheduledTime,
}: Pick<Task, 'scheduledDate' | 'scheduledTime'>) {
  if (!scheduledDate) return 'Sin fecha';
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const date = dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
  return scheduledTime ? `${date} · ${scheduledTime}` : date;
}

/** Un instante (creación, edición) se muestra en la zona horaria del perfil de quien lo mira (constitución §8). */
export const formatInstant = (iso: string, timeZone: string | undefined) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(iso),
  );
