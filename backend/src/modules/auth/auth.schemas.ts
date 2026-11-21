import { z } from 'zod';
import type { UserDto } from '../users/users.schemas.js';

const email = z
  .string({ error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo no puede superar los 254 caracteres.')
  .pipe(z.email('Escribe un correo válido.'));

/**
 * Acepta cualquier zona que Intl reconozca y guarda su forma resuelta. Solo 'UTC' o nombres con
 * región ('Area/Ciudad') cuentan: Intl también admite offsets ('+05:00') y abreviaturas ('EST'),
 * que no son zonas IANA. Si no es válida se guarda UTC (R-01). No usamos supportedValuesOf: solo
 * lista los nombres antiguos de ICU y rechazaría zonas vigentes (Asia/Kolkata, Europe/Kyiv...).
 */
const toValidTimezone = (tz: string) => {
  if (tz !== 'UTC' && !tz.includes('/')) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export const registerSchema = z.strictObject({
  displayName: z
    .string({ error: 'El nombre es obligatorio.' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(60, 'El nombre no puede superar los 60 caracteres.'),
  email,
  password: z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(128, 'La contraseña no puede superar los 128 caracteres.'),
  timezone: z
    .string({ error: 'La zona horaria es obligatoria.' })
    .max(64, 'La zona horaria no es válida.')
    .transform(toValidTimezone),
});

export const loginSchema = z.strictObject({
  email,
  password: z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(1, 'La contraseña es obligatoria.')
    .max(128, 'La contraseña no puede superar los 128 caracteres.'),
});

export const verifyEmailSchema = z.strictObject({
  token: z
    .string({ error: 'El enlace no es válido.' })
    .min(1, 'El enlace no es válido.')
    .max(128, 'El enlace no es válido.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthSessionDto {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: UserDto;
}
