import { AppError } from '../http/problem.js';
import { redis } from '../redis.js';

/**
 * Cuenta el intento (INCR + EXPIRE NX atómicos) y falla si supera el límite. Al contar antes de
 * trabajar, las peticiones simultáneas no pueden saltarse el límite.
 */
export async function consume(key: string, limit: number, windowSeconds: number): Promise<void> {
  const results = await redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
  const count = Number(results?.[0]?.[1] ?? 0);
  if (count > limit) {
    const retryAfter = Math.max(await redis.ttl(key), 1);
    throw new AppError('TOO_MANY_REQUESTS', 'Demasiados intentos. Inténtalo de nuevo más tarde.', {
      retryAfter,
    });
  }
}

export const resetLimit = (key: string): Promise<number> => redis.del(key);
