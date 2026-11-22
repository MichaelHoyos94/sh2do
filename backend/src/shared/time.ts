import { DateTime } from 'luxon';

/**
 * Instante UTC de una fecha y hora locales en una zona IANA.
 * Sin fecha o sin hora no hay instante: devuelve `null`.
 *
 * Si la hora no existe en esa zona (salto de cambio de horario, p. ej. 02:30 el día
 * que los relojes pasan de 02:00 a 03:00), Luxon la adelanta a la primera hora válida.
 * Se acepta ese comportamiento a propósito: nunca se rechaza un pendiente por un salto
 * del calendario, y los recordatorios (STD-15) parten de este mismo instante.
 */
export function toUtcInstant(date: string | null, time: string | null, zone: string): Date | null {
  if (!date || !time) return null;
  const local = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!local.isValid) throw new Error(`Invalid local date/time or zone: ${local.invalidReason}`);
  return local.toUTC().toJSDate();
}

/** `YYYY-MM-DD` de una columna DATE de Prisma (medianoche UTC). */
export const dateColumnToString = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/** `HH:mm` de una columna TIME de Prisma (1970-01-01 a esa hora, en UTC). */
export const timeColumnToString = (value: Date | null): string | null =>
  value ? value.toISOString().slice(11, 16) : null;

/** Valor para una columna DATE de Prisma a partir de `YYYY-MM-DD`. */
export const stringToDateColumn = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

/** Valor para una columna TIME de Prisma a partir de `HH:mm`. */
export const stringToTimeColumn = (value: string | null): Date | null =>
  value ? new Date(`1970-01-01T${value}:00.000Z`) : null;
