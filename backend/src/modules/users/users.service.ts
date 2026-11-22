import { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/http/problem.js';
import { usersRepository } from './users.repository.js';
import { toUserDto } from './users.schemas.js';

export const usersService = {
  /** El correo ya llega normalizado (trim + minúsculas). La restricción UNIQUE evita duplicados incluso con peticiones simultáneas. */
  async create(
    data: { email: string; passwordHash: string; displayName: string; timezone: string },
    db?: Db,
  ) {
    try {
      return await usersRepository.create(data, db);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('EMAIL_ALREADY_REGISTERED', 'Ya existe una cuenta con este correo.');
      }
      throw err;
    }
  },

  findByEmail: (email: string) => usersRepository.findByEmail(email),

  findById: (id: number) => usersRepository.findById(id),

  /** Solo la zona horaria: los demás módulos no necesitan (ni deben recibir) la fila con el hash. */
  async getTimezone(id: number) {
    const user = await usersRepository.findById(id);
    return user?.timezone ?? null;
  },

  updatePassword: (id: number, passwordHash: string, db?: Db) =>
    usersRepository.updatePassword(id, passwordHash, db),

  markEmailVerified: (id: number, at: Date, db?: Db) =>
    usersRepository.markEmailVerified(id, at, db),

  /** Usuario de la sesión actual; si ya no existe, la sesión deja de ser válida. */
  async getCurrent(userId: number) {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.');
    return toUserDto(user);
  },
};
