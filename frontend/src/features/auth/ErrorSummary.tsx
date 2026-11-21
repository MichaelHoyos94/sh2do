import { Alert } from '@/components/ui/alert';

/** Resumen anunciado (role="alert") de los campos con error tras un envío fallido; el foco va al primero. */
export function ErrorSummary({ errors, labels }: { errors: Record<string, unknown>; labels: Record<string, string> }) {
  const names = Object.keys(labels).filter((id) => errors[id]).map((id) => labels[id]);
  if (names.length === 0) return null;
  return (
    <Alert variant="destructive" role="alert">
      Revisa los campos marcados: {names.join(', ')}.
    </Alert>
  );
}
