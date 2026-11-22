import { useNavigate } from 'react-router';
import { PageTitle } from '@/components/PageTitle';
import { Card } from '@/components/ui/card';
import { CancelLink } from './CancelLink';
import { TaskForm } from './TaskForm';
import { useCreateTask } from './useTasks';

export function NewTaskPage() {
  const navigate = useNavigate();
  const create = useCreateTask();

  return (
    <div className="space-y-6">
      <PageTitle>Nuevo pendiente</PageTitle>
      <Card>
        <TaskForm
          submitLabel="Crear pendiente"
          pending={create.isPending}
          error={create.error}
          onSubmit={(values) =>
            create.mutate(values, { onSuccess: (task) => navigate(`/tasks/${task.id}`) })
          }
          footer={<CancelLink to="/tasks" />}
        />
      </Card>
    </div>
  );
}
