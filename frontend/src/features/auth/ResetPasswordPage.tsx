import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { ErrorSummary } from './ErrorSummary';
import { FormField } from './FormField';
import { checkResetToken, resetPassword } from './authApi';
import { splitError, useFocusFirstError, type FieldErrors } from './formErrors';

const LABELS = { password: 'Contraseña nueva', confirmPassword: 'Confirma la contraseña' };
const FIELDS = Object.keys(LABELS);

// 400 = enlace vencido, ya usado o reemplazado (el código exacto no cambia lo que ve el usuario).
const isRejectedLink = (error: unknown) => error instanceof ApiError && error.status === 400;

/** Pública, con o sin sesión: el token del enlace es la credencial. */
export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token');
  const navigate = useNavigate();
  const { clearSession } = useAuth();
  const started = useRef(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  useFocusFirstError(errors, FIELDS);

  const check = useMutation({ mutationFn: checkResetToken });
  const { mutate: runCheck } = check;
  const reset = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      // El servidor ya cerró todas las sesiones: se limpia la local sin llamar a /auth/logout.
      clearSession();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    },
    onError: (error) => {
      if (isRejectedLink(error)) return;
      const { fields, form } = splitError(error, ['password']);
      setErrors(fields);
      setFormError(form);
    },
  });

  useEffect(() => {
    // Comprobar no consume el enlace, pero StrictMode no debe disparar la petición dos veces.
    if (!token || started.current) return;
    started.current = true;
    runCheck(token);
  }, [token, runCheck]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    const confirmPassword = String(data.get('confirmPassword'));

    // Solo experiencia de usuario: la validación que vale es la del servidor.
    const next: FieldErrors = {};
    if (password.length < 8 || password.length > 128) next.password = 'La contraseña debe tener entre 8 y 128 caracteres.';
    if (confirmPassword !== password) next.confirmPassword = 'Las contraseñas no coinciden.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) reset.mutate({ token, password });
  }

  const linkRejected = isRejectedLink(check.error) || isRejectedLink(reset.error);

  if (!token || linkRejected) {
    return (
      <AuthShell title="El enlace venció o ya se usó">
        <div className="space-y-4">
          <Alert variant="destructive" role="alert">
            {token
              ? 'Este enlace ya no sirve: venció, ya se usó o lo reemplazó uno más reciente.'
              : 'Falta el código del enlace. Abre el enlace completo que te enviamos por correo.'}
          </Alert>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Pedir un enlace nuevo</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (check.isError) {
    return (
      <AuthShell title="No pudimos comprobar el enlace">
        <div className="space-y-4">
          <Alert variant="destructive" role="alert">
            {describeError(check.error)}
          </Alert>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Pedir un enlace nuevo</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!check.isSuccess) {
    return (
      <AuthShell title="Comprobando tu enlace">
        <p role="status" className="text-muted-foreground">
          Un momento, por favor…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Elige una contraseña nueva">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <ErrorSummary errors={errors} labels={LABELS} />
        {formError && (
          <Alert variant="destructive" role="alert">
            {formError}
          </Alert>
        )}
        <FormField
          id="password"
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          hint="Entre 8 y 128 caracteres."
          error={errors.password}
        />
        <FormField
          id="confirmPassword"
          label="Confirma la contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
        />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </AuthShell>
  );
}
