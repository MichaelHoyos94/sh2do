import { prisma, type Db } from '../../shared/db/prisma.js';

export const sessionRepository = {
  create: (data: { userId: number; refreshTokenHash: string; expiresAt: Date }, db: Db = prisma) =>
    db.userSession.create({ data }),

  findByHash: (refreshTokenHash: string) =>
    prisma.userSession.findUnique({ where: { refreshTokenHash } }),

  /** Revoca solo si seguía vigente; devuelve false si otra petición se adelantó (posible reutilización). */
  async revoke(id: number, at: Date, db: Db = prisma): Promise<boolean> {
    const { count } = await db.userSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, lastUsedAt: at },
    });
    return count === 1;
  },

  revokeByHash: (refreshTokenHash: string, at: Date) =>
    prisma.userSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: at },
    }),

  revokeAllForUser: (userId: number, at: Date, db: Db = prisma) =>
    db.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } }),
};
