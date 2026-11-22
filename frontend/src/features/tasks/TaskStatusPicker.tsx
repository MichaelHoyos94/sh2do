import { useId } from 'react';
import { describeError } from '@/api/client';
import type { Task, TaskStatus } from '@/api/types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STATUS_LABELS } from './format';
import { useSetTaskStatus } from './useTasks';

const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];

/**
 * Tres botones y no radios ni `<select>`: con el teclado las flechas cambian la selección de esos
 * controles y cada cambio guardaría (R-07). Guarda al pulsar, sin actualización optimista (R-08).
 */
export function TaskStatusPicker({ task }: { task: Pick<Task, 'id' | 'status'> }) {
  const labelId = useId();
  const mutation = useSetTaskStatus(task.id);

  const choose = (status: TaskStatus) => {
    if (status !== task.status) mutation.mutate(status);
  };

  return (
    <div className="space-y-2">
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        <span id={labelId} className="text-sm font-medium text-muted-foreground">
          Estado
        </span>
        {STATUSES.map((status) => {
          const active = status === task.status;
          return (
            <Button
              key={status}
              type="button"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              disabled={mutation.isPending}
              className={cn(active && 'ring-2 ring-primary ring-offset-2')}
              onClick={() => choose(status)}
            >
              {active && <span aria-hidden="true">✓</span>}
              {STATUS_LABELS[status]}
            </Button>
          );
        })}
      </div>
      <p role="status" className="text-sm font-medium">
        {mutation.isPending ? 'Guardando…' : mutation.isSuccess ? 'Estado actualizado' : ''}
      </p>
      {mutation.isError && (
        <Alert variant="destructive" role="alert">
          {describeError(mutation.error)}
        </Alert>
      )}
    </div>
  );
}
