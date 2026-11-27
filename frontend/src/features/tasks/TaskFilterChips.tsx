import { useId } from 'react';
import type { TaskPriority, TaskStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTags } from '@/features/tags/useTags';
import { PRIORITY_LABELS, STATUS_LABELS } from './format';
import { hasFilters, toggleFilter, type TaskFilters as Filters } from './taskFilters';

type Props = { filters: Filters; onChange: (filters: Filters) => void };

/** Chips combinables: OR dentro de un grupo, AND entre grupos (lo resuelve la API). */
export function TaskFilterChips({ filters, onChange }: Props) {
  const tags = useTags().data?.pages.flatMap((page) => page.items) ?? [];
  const statuses = Object.entries(STATUS_LABELS) as [TaskStatus, string][];
  const priorities = Object.entries(PRIORITY_LABELS) as [TaskPriority, string][];

  return (
    <div className="space-y-3">
      <ChipGroup
        title="Estado"
        chips={statuses.map(([value, label]) => ({
          label,
          active: filters.status.includes(value),
          toggle: () => onChange(toggleFilter(filters, 'status', value)),
        }))}
      />
      <ChipGroup
        title="Prioridad"
        chips={priorities.map(([value, label]) => ({
          label,
          active: filters.priority.includes(value),
          toggle: () => onChange(toggleFilter(filters, 'priority', value)),
        }))}
      />
      {tags.length > 0 && (
        <ChipGroup
          title="Etiquetas"
          chips={tags.map((tag) => ({
            label: tag.name,
            active: filters.tagIds.includes(tag.id),
            toggle: () => onChange(toggleFilter(filters, 'tagIds', tag.id)),
          }))}
        />
      )}
      {hasFilters(filters) && (
        <Button
          variant="outline"
          onClick={() => onChange({ status: [], priority: [], tagIds: [] })}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

type Chip = { label: string; active: boolean; toggle: () => void };

function ChipGroup({ title, chips }: { title: string; chips: Chip[] }) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-wrap items-center gap-2">
      <span id={titleId} className="w-full text-sm font-medium text-muted-foreground sm:w-auto">
        {title}
      </span>
      {chips.map(({ label, active, toggle }) => (
        <Button
          key={label}
          type="button"
          variant={active ? 'default' : 'outline'}
          aria-pressed={active}
          className={cn('break-all', active && 'ring-2 ring-primary ring-offset-2')}
          onClick={toggle}
        >
          {active && <span aria-hidden="true">✓</span>}
          {label}
        </Button>
      ))}
    </div>
  );
}
