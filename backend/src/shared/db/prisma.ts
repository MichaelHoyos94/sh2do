import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { env } from '../config/env.js';

// Prisma 7 exige un driver adapter; MySQL usa el de MariaDB.
const url = new URL(env.DATABASE_URL);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 10,
});

export const prisma = new PrismaClient({ adapter });

/** Cliente normal o de transacción: los repositorios aceptan ambos. */
export type Db = PrismaClient | Prisma.TransactionClient;
