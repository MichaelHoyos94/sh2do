import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AuthShell } from './AuthShell';
import { ErrorSummary } from './ErrorSummary';
import { FormField } from './FormField';
import { forgotPassword } from './authApi';
import { splitError, useFocusFirstError, type FieldErrors } from './formErrors';

const LABELS = { email: 'Correo electrónico' };
const FIELDS = Object.keys(LABELS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  useFocusFirstError(errors, FIELDS);

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onError: (error) => {
      const { fields, form } = splitError(error, FIELDS);
      setErrors(fields);
      setFormError(form);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    const next: FieldErrors = EMAIL_PATTERN.test(email) ? {} : { email: 'Escribe un correo válido.' };
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) mutation.mutate({ email });
  }

  return (
    <AuthShell title="¿Olvidaste tu contraseña?">
      {/* La región existe desde el inicio para que el lector de pantalla anuncie el mensaje al aparecer. */}
      <div role="status">
        {mutation.isSuccess && (
          <Alert variant="success">
            Si existe una cuenta con ese correo, te enviamos un enlace para cambiar tu contraseña. Revisa tu bandeja de
            entrada; el enlace vale 24 horas.
          </Alert>
        )}
      </div>
      {!mutation.isSuccess && (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-muted-foreground">Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
          <ErrorSummary errors={errors} labels={LABELS} />
          {formError && (
            <Alert variant="destructive" role="alert">
              {formError}
            </Alert>
          )}
          <FormField id="email" label="Correo electrónico" type="email" autoComplete="email" error={errors.email} />
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enviando…' : 'Enviar enlace'}
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-semibold text-primary underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
