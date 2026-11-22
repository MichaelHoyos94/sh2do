import type { Task, TaskPriority, TaskStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABELS, STATUS_LABELS } from './format';

const STATUS_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
} as const satisfies Record<TaskStatus, 'neutral' | 'info' | 'success'>;
const PRIORITY_VARIANT = {
  low: 'neutral',
  medium: 'warning',
  high: 'destructive',
} as const satisfies Record<TaskPriority, 'neutral' | 'warning' | 'destructive'>;

/** Estado y prioridad siempre con texto: el color es solo un refuerzo. */
export function TaskBadges({ task }: { task: Pick<Task, 'status' | 'priority'> }) {
  return (
    <>
      <Badge variant={STATUS_VARIANT[task.status]}>{STATUS_LABELS[task.status]}</Badge>
      <Badge variant={PRIORITY_VARIANT[task.priority]}>
        Prioridad: {PRIORITY_LABELS[task.priority]}
      </Badge>
    </>
  );
}
