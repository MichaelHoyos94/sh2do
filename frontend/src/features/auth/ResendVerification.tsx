import { useMutation } from '@tanstack/react-query';
import { ApiError, describeError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';

/** Botón de reenvío; el resultado se anuncia en una región `aria-live` que siempre está en el DOM. */
export function ResendVerification() {
  const { resendVerification } = useAuth();
  const mutation = useMutation({ mutationFn: resendVerification });

  let message = '';
  if (mutation.isSuccess) message = 'Te enviamos un nuevo enlace. Revisa tu bandeja de entrada.';
  else if (mutation.error instanceof ApiError && mutation.error.code === 'EMAIL_ALREADY_VERIFIED') {
    message = 'Tu correo ya está verificado.';
  } else if (mutation.error) message = describeError(mutation.error);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Enviando…' : 'Reenviar correo'}
      </Button>
      <p role="status" className="text-sm font-medium">
        {message}
      </p>
    </div>
  );
}
