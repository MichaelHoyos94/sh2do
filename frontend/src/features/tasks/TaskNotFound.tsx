import { Link } from 'react-router';
import { PageTitle } from '@/components/PageTitle';

export function TaskNotFound() {
  return (
    <div className="space-y-4">
      <PageTitle>Este pendiente no existe</PageTitle>
      <p className="text-muted-foreground">
        Puede que el enlace sea incorrecto o que ya no esté disponible.
      </p>
      <Link to="/tasks" className="font-semibold text-primary underline underline-offset-4">
        Volver a mis pendientes
      </Link>
    </div>
  );
}
