import { Link } from 'react-router';
import { PageTitle } from '@/components/PageTitle';

export function NotFoundPage() {
  return (
    <div className="space-y-4">
      <PageTitle>Página no encontrada</PageTitle>
      <p className="text-muted-foreground">La dirección que abriste no existe.</p>
      <Link to="/" className="font-semibold text-primary underline underline-offset-4">
        Volver al inicio
      </Link>
    </div>
  );
}
