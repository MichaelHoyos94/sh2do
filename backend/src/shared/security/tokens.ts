import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de 32 bytes aleatorios. Solo viaja en claro por la cookie o el correo. */
export const generateToken = (): string => randomBytes(32).toString('base64url');

/** En la BD solo se guarda el SHA-256 (64 caracteres hex). */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
