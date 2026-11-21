import { prisma, type Db } from '../../shared/db/prisma.js';

export const verificationTokenRepository = {
  create: (data: { userId: number; tokenHash: string; expiresAt: Date }, db: Db = prisma) =>
    db.emailVerificationToken.create({ data }),

  findById: (id: number) => prisma.emailVerificationToken.findUnique({ where: { id } }),

  findByHash: (tokenHash: string) =>
    prisma.emailVerificationToken.findUnique({ where: { tokenHash } }),

  /** Un solo uso: devuelve false si otra petición ya lo consumió. */
  async markUsed(id: number, at: Date, db: Db = prisma): Promise<boolean> {
    const { count } = await db.emailVerificationToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return count === 1;
  },

  /** Anula los enlaces sin usar de un usuario marcándolos como usados (sin columnas nuevas). */
  invalidateUnused: (userId: number, at: Date, db: Db = prisma) =>
    db.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: at },
    }),
};
