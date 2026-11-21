import { prisma, type Db } from '../../shared/db/prisma.js';

export const usersRepository = {
  create: (
    data: { email: string; passwordHash: string; displayName: string; timezone: string },
    db: Db = prisma,
  ) => db.user.create({ data }),

  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findById: (id: number) => prisma.user.findUnique({ where: { id } }),

  updatePassword: (id: number, passwordHash: string, db: Db = prisma) =>
    db.user.update({ where: { id }, data: { passwordHash } }),

  markEmailVerified: (id: number, at: Date, db: Db = prisma) =>
    db.user.update({ where: { id }, data: { emailVerifiedAt: at } }),
};
