import { Link, useParams } from 'react-router';
import { describeError } from '@/api/client';
import { PageTitle } from '@/components/PageTitle';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatInstant, formatSchedule } from './format';
import { TaskBadges } from './TaskBadges';
import { TaskTags } from './TaskTags';
import { TaskNotFound } from './TaskNotFound';
import { TaskStatusPicker } from './TaskStatusPicker';
import { tasksListPath } from './taskFilters';
import { isTaskNotFound, parseTaskId, useTask } from './useTasks';

export function TaskDetailPage() {
  const id = parseTaskId(useParams().taskId);
  const query = useTask(id);
  const timezone = useAuth().user?.timezone;

  if (isTaskNotFound(id, query.error)) return <TaskNotFound />;
  if (query.isError) {
    return (
      <Alert variant="destructive" role="alert">
        {describeError(query.error)}
      </Alert>
    );
  }
  if (!query.data) {
    return (
      <p role="status" className="text-muted-foreground">
        Cargando pendiente…
      </p>
    );
  }
  const task = query.data;

  return (
    <div className="space-y-6">
      <Link
        to={tasksListPath()}
        className="text-sm font-semibold text-primary underline underline-offset-4"
      >
        Volver a mis pendientes
      </Link>
      <Card className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageTitle className="break-words">{task.title}</PageTitle>
          <Button asChild variant="outline">
            <Link to={`/tasks/${task.id}/edit`}>Editar</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TaskBadges task={task} />
        </div>
        <TaskTags tags={task.tags} />
        <TaskStatusPicker task={task} />
        <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Detail term="Descripción">
            {task.description ? (
              <span className="whitespace-pre-wrap break-words">{task.description}</span>
            ) : (
              <span className="text-muted-foreground">Sin descripción</span>
            )}
          </Detail>
          <Detail term="Fecha y hora">{formatSchedule(task)}</Detail>
          <Detail term="Zona horaria">{task.timezone}</Detail>
          <Detail term="Creado">{formatInstant(task.createdAt, timezone)}</Detail>
          <Detail term="Última edición">{formatInstant(task.updatedAt, timezone)}</Detail>
        </dl>
      </Card>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-sm font-medium text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </>
  );
}
