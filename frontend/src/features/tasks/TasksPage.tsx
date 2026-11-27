import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { describeError } from '@/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/PageTitle';
import { formatSchedule } from './format';
import { TaskBadges } from './TaskBadges';
import { TaskFilterChips } from './TaskFilterChips';
import { TaskTags } from './TaskTags';
import { hasFilters, readFilters, rememberListSearch, writeFilters } from './taskFilters';
import { useTaskList } from './useTasks';

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const search = writeFilters(filters).toString();
  useEffect(() => rememberListSearch(search), [search]);
  const filtered = hasFilters(filters);
  const list = useTaskList(filters);
  const tasks = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Mis pendientes</PageTitle>
        <Button asChild>
          <Link to="/tasks/new">Nuevo pendiente</Link>
        </Button>
      </div>

      <TaskFilterChips filters={filters} onChange={(next) => setParams(writeFilters(next))} />

      {list.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando pendientes…
        </p>
      )}

      {list.isError && !list.data && (
        <div className="space-y-3">
          <Alert variant="destructive" role="alert">
            {describeError(list.error)}
          </Alert>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && tasks.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          {filtered ? (
            <>
              <p className="text-lg font-semibold">Ningún pendiente coincide con los filtros.</p>
              <Button variant="outline" onClick={() => setParams({})}>
                Limpiar filtros
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Aún no tienes pendientes</p>
              <p className="text-muted-foreground">Crea el primero y empieza a organizarte.</p>
            </>
          )}
        </div>
      )}

      {tasks.length > 0 && (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <Link
                to={`/tasks/${task.id}`}
                className="break-words text-lg font-semibold text-primary underline-offset-4 hover:underline"
              >
                {task.title}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{formatSchedule(task)}</span>
                <TaskBadges task={task} />
              </div>
              <div className="mt-2">
                <TaskTags tags={task.tags} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.isError && list.data && (
        <Alert variant="destructive" role="alert">
          {describeError(list.error)}
        </Alert>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {list.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
}
