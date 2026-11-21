import { useNavigate, useParams } from 'react-router';
import { describeError } from '@/api/client';
import { PageTitle } from '@/components/PageTitle';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { CancelLink } from './CancelLink';
import { TaskForm } from './TaskForm';
import { TaskNotFound } from './TaskNotFound';
import { diffTask } from './taskValues';
import { isTaskNotFound, parseTaskId, useTask, useUpdateTask } from './useTasks';

export function EditTaskPage() {
  const id = parseTaskId(useParams().taskId);
  const navigate = useNavigate();
  const query = useTask(id);
  const update = useUpdateTask(id ?? 0);

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
      <PageTitle>Editar pendiente</PageTitle>
      <Card>
        <TaskForm
          initial={task}
          submitLabel="Guardar cambios"
          pending={update.isPending}
          error={update.error}
          onSubmit={(values) =>
            update.mutate(diffTask(task, values), {
              onSuccess: () => navigate(`/tasks/${task.id}`),
            })
          }
          footer={<CancelLink to={`/tasks/${task.id}`} />}
        />
      </Card>
    </div>
  );
}
