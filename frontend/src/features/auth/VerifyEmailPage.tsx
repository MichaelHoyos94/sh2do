import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { ResendVerification } from './ResendVerification';
import { verifyEmail } from './authApi';

/** Funciona con o sin sesión: el token del enlace es la credencial. */
export function VerifyEmailPage() {
  const token = useSearchParams()[0].get('token');
  const { status, markEmailVerified } = useAuth();
  const started = useRef(false);
  const mutation = useMutation({ mutationFn: verifyEmail, onSuccess: markEmailVerified });
  const { mutate } = mutation;

  useEffect(() => {
    // Se espera a la restauración de la sesión para que markEmailVerified actualice al usuario ya cargado.
    // El token es de un solo uso: StrictMode no debe disparar la petición dos veces.
    if (!token || status === 'loading' || started.current) return;
    started.current = true;
    mutate(token);
  }, [token, status, mutate]);

  const failed = !token || mutation.isError;
  const expired = mutation.error instanceof ApiError && mutation.error.code === 'VERIFICATION_TOKEN_EXPIRED';

  let title = 'Verificando tu correo';
  if (mutation.isSuccess) title = 'Correo verificado';
  else if (failed) title = expired ? 'El enlace venció' : 'Enlace no válido';

  return (
    <AuthShell title={title}>
      <div role="status" className="space-y-4">
        {!failed && !mutation.isSuccess && <p className="text-muted-foreground">Un momento, por favor…</p>}
        {mutation.isSuccess && (
          <>
            <Alert variant="success">Listo, tu correo quedó verificado.</Alert>
            <Button asChild className="w-full">
              <Link to="/">Continuar</Link>
            </Button>
          </>
        )}
      </div>
      {failed && (
        <div className="space-y-4">
          <Alert variant="destructive" role="alert">
            {mutation.error
              ? describeError(mutation.error)
              : 'Falta el código de verificación. Abre el enlace completo que te enviamos por correo.'}
          </Alert>
          {status === 'authenticated' && <ResendVerification />}
          {status === 'anonymous' && (
            <p className="text-sm">
              <Link to="/login" className="font-semibold text-primary underline underline-offset-4">
                Inicia sesión
              </Link>{' '}
              para pedir un enlace nuevo.
            </p>
          )}
        </div>
      )}
    </AuthShell>
  );
}
