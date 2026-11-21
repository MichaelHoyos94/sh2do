import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { withRedirect } from '@/lib/redirect';
import { detectTimezone } from '@/lib/timezone';
import { useAuth } from './AuthProvider';
import { AuthShell } from './AuthShell';
import { ErrorSummary } from './ErrorSummary';
import { FormField } from './FormField';
import { splitError, useFocusFirstError } from './formErrors';

const LABELS = {
  displayName: 'Nombre visible',
  email: 'Correo electrónico',
  password: 'Contraseña',
  confirmPassword: 'Confirma la contraseña',
};
const FIELDS = Object.keys(LABELS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tras registrarse, RedirectIfAuthenticated lleva a `/`, donde se ve el aviso "Verifica tu correo".
export function RegisterPage() {
  const { register } = useAuth();
  const redirect = useSearchParams()[0].get('redirect');
  const loginPath = withRedirect('/login', redirect);
  const [errors, setErrors] = useState<Record<string, ReactNode>>({});
  const [formError, setFormError] = useState<string | null>(null);
  useFocusFirstError(errors, FIELDS);

  const mutation = useMutation({
    mutationFn: register,
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setErrors({
          email: (
            <>
              Ya existe una cuenta con este correo.{' '}
              <Link to={loginPath} className="underline underline-offset-4">
                Inicia sesión
              </Link>
            </>
          ),
        });
        setFormError(null);
        return;
      }
      const { fields, form } = splitError(error, FIELDS);
      setErrors(fields);
      setFormError(form);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get('displayName')).trim();
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    const confirmPassword = String(data.get('confirmPassword'));

    // Solo experiencia de usuario: la validación que vale es la del servidor.
    const next: Record<string, string> = {};
    if (displayName.length < 2 || displayName.length > 60) next.displayName = 'El nombre debe tener entre 2 y 60 caracteres.';
    if (!EMAIL_PATTERN.test(email)) next.email = 'Escribe un correo válido.';
    if (password.length < 8 || password.length > 128) next.password = 'La contraseña debe tener entre 8 y 128 caracteres.';
    if (confirmPassword !== password) next.confirmPassword = 'Las contraseñas no coinciden.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) mutation.mutate({ displayName, email, password, timezone: detectTimezone() });
  }

  return (
    <AuthShell title="Crea tu cuenta">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <ErrorSummary errors={errors} labels={LABELS} />
        {formError && (
          <Alert variant="destructive" role="alert">
            {formError}
          </Alert>
        )}
        <FormField id="displayName" label="Nombre visible" autoComplete="name" error={errors.displayName} />
        <FormField id="email" label="Correo electrónico" type="email" autoComplete="email" error={errors.email} />
        <FormField
          id="password"
          label="Contraseña"
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
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link to={loginPath} className="font-semibold text-primary underline underline-offset-4">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
