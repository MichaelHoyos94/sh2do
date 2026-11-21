import { useEffect } from 'react';
import { ApiError, describeError } from '@/api/client';

export type FieldErrors = Record<string, string>;

/** Reparte un error de la API: los 422 por campo conocido; todo lo demás, a un mensaje general. */
export function splitError(error: unknown, knownFields: string[]): { fields: FieldErrors; form: string | null } {
  if (error instanceof ApiError && error.status === 422) {
    const fields: FieldErrors = {};
    for (const { field, message } of error.fieldErrors) {
      if (knownFields.includes(field) && !fields[field]) fields[field] = message;
    }
    if (Object.keys(fields).length > 0) return { fields, form: null };
  }
  return { fields: {}, form: describeError(error) };
}

/** Lleva el foco al primer campo con error (en el orden visual del formulario). */
export function useFocusFirstError(errors: Record<string, unknown>, order: string[]) {
  useEffect(() => {
    const first = order.find((id) => errors[id]);
    if (first) document.getElementById(first)?.focus();
  }, [errors, order]);
}
