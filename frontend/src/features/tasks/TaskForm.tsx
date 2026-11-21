import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorSummary } from '@/features/auth/ErrorSummary';
import { FormField } from '@/features/auth/FormField';
import { splitError, useFocusFirstError, type FieldErrors } from '@/features/auth/formErrors';
import type { Task } from '@/api/types';
import { DESCRIPTION_MAX, TITLE_MAX, type TaskValues } from './taskValues';

const LABELS = {
  title: 'Título',
  description: 'Descripción',
  scheduledDate: 'Fecha',
  scheduledTime: 'Hora',
};
const FIELDS = Object.keys(LABELS);

type Props = {
  initial?: Task;
  submitLabel: string;
  pending: boolean;
  /** Error de la última petición de guardado (los 422 se reparten por campo). */
  error: unknown;
  onSubmit: (values: TaskValues) => void;
  footer?: ReactNode;
};

/** Formulario compartido por crear y editar. La validación es solo de experiencia: la que vale es la del servidor. */
export function TaskForm({ initial, submitLabel, pending, error, onSubmit, footer }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial?.scheduledDate ?? '');
  const [time, setTime] = useState(initial?.scheduledTime ?? '');
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const server = useMemo(() => (error ? splitError(error, FIELDS) : null), [error]);
  const clientFailed = Object.keys(clientErrors).length > 0;
  // Si el cliente rechaza el envío, el error del servidor anterior ya no aplica.
  const errors = useMemo<FieldErrors>(
    () => (clientFailed ? clientErrors : (server?.fields ?? {})),
    [clientFailed, clientErrors, server],
  );
  const formError = clientFailed ? null : (server?.form ?? null);
  useFocusFirstError(errors, FIELDS);

  function onDateChange(value: string) {
    setDate(value);
    if (!value) setTime('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FieldErrors = {};
    // Una fecha incompleta o inexistente deja el campo con value '' (badInput): sin esto se guardaría "sin fecha".
    const dateInput = event.currentTarget.elements.namedItem('scheduledDate') as HTMLInputElement;
    if (dateInput.validity.badInput)
      next.scheduledDate = 'Escribe una fecha válida o déjala vacía.';
    const cleanTitle = title.trim();
    if (!cleanTitle) next.title = 'El título es obligatorio.';
    else if (cleanTitle.length > TITLE_MAX)
      next.title = `El título no puede pasar de ${TITLE_MAX} caracteres.`;
    if (description.trim().length > DESCRIPTION_MAX) {
      next.description = `La descripción no puede pasar de ${DESCRIPTION_MAX} caracteres.`;
    }
    setClientErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      title: cleanTitle,
      description: description.trim() || null,
      scheduledDate: date || null,
      scheduledTime: date && time ? time : null,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {/* El resumen y el error general se anuncian con role="alert" al aparecer. */}
      <ErrorSummary errors={errors} labels={LABELS} />
      {formError && (
        <Alert variant="destructive" role="alert">
          {formError}
        </Alert>
      )}
      <FormField
        id="title"
        label="Título"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        autoComplete="off"
        error={errors.title}
      />
      <div className="space-y-1.5">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        {errors.description && (
          <p id="description-error" className="text-sm font-medium text-destructive">
            {errors.description}
          </p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="scheduledDate"
          label="Fecha (opcional)"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          error={errors.scheduledDate}
        />
        <FormField
          id="scheduledTime"
          label="Hora (opcional)"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date}
          hint={date ? undefined : 'Elige una fecha para poder poner la hora.'}
          error={errors.scheduledTime}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  );
}
