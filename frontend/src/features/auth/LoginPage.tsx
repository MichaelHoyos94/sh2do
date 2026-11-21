import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { withRedirect } from '@/lib/redirect';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { ErrorSummary } from './ErrorSummary';
import { FormField } from './FormField';
import { splitError, useFocusFirstError, type FieldErrors } from './formErrors';

const LABELS = { email: 'Correo electrónico', password: 'Contraseña' };
const FIELDS = Object.keys(LABELS);

// Al iniciar sesión, RedirectIfAuthenticated lleva a `redirect` (si es interno) o a `/`.
export function LoginPage() {
  const { login } = useAuth();
  const redirect = useSearchParams()[0].get('redirect');
  const passwordChanged = (useLocation().state as { passwordChanged?: boolean } | null)?.passwordChanged;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  useFocusFirstError(errors, FIELDS);

  const mutation = useMutation({
    mutationFn: login,
    onError: (error) => {
      const { fields, form } = splitError(error, FIELDS);
      setErrors(fields);
      setFormError(form);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    const next: FieldErrors = {};
    if (!email) next.email = 'Escribe tu correo.';
    if (!password) next.password = 'Escribe tu contraseña.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) mutation.mutate({ email, password });
  }

  return (
    <AuthShell title="Inicia sesión">
      {passwordChanged && (
        <Alert variant="success" role="status">
          Tu contraseña se cambió. Inicia sesión con la nueva.
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <ErrorSummary errors={errors} labels={LABELS} />
        {formError && (
          <Alert variant="destructive" role="alert">
            {formError}
          </Alert>
        )}
        <FormField id="email" label="Correo electrónico" type="email" autoComplete="email" error={errors.email} />
        <FormField id="password" label="Contraseña" type="password" autoComplete="current-password" error={errors.password} />
        <p className="text-sm">
          <Link to="/forgot-password" className="font-semibold text-primary underline underline-offset-4">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Entrando…' : 'Iniciar sesión'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link to={withRedirect('/register', redirect)} className="font-semibold text-primary underline underline-offset-4">
          Regístrate
        </Link>
      </p>
    </AuthShell>
  );
}
