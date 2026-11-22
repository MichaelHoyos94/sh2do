import { Link } from 'react-router';

export function CancelLink({ to }: { to: string }) {
  return (
    <Link to={to} className="text-sm font-semibold text-primary underline underline-offset-4">
      Cancelar
    </Link>
  );
}
