import { Link } from 'react-router';
import { describeError } from '@/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/PageTitle';
import { formatSchedule } from './format';
import { TaskBadges } from './TaskBadges';
import { useTaskList } from './useTasks';

export function TasksPage() {
  const list = useTaskList();
  const tasks = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Mis pendientes</PageTitle>
        <Button asChild>
          <Link to="/tasks/new">Nuevo pendiente</Link>
        </Button>
      </div>

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
          <p className="text-lg font-semibold">Aún no tienes pendientes</p>
          <p className="text-muted-foreground">Crea el primero y empieza a organizarte.</p>
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
