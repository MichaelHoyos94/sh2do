import type { User } from '../../generated/prisma/client.js';
import { clock } from '../../shared/clock.js';
import { prisma, type Db } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/http/problem.js';
import { logger } from '../../shared/logger.js';
import { emailDeliveriesRepository } from '../../shared/mail/email-deliveries.repository.js';
import { enqueueSendEmail } from '../../shared/queue/queues.js';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from '../../shared/security/jwt.js';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../../shared/security/password.js';
import { consume, resetLimit } from '../../shared/security/rate-limit.js';
import { generateToken, hashToken } from '../../shared/security/tokens.js';
import { toUserDto } from '../users/users.schemas.js';
import { usersService } from '../users/users.service.js';
import type { AuthSessionDto, LoginInput, RegisterInput } from './auth.schemas.js';
import { sessionRepository } from './session.repository.js';
import { verificationTokenRepository } from './verification-token.repository.js';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // R-08: 30 días deslizantes
const REFRESH_RACE_MS = 10_000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // R-05
const HOUR = 3600;

/** 401 por carrera de refresh: el controlador NO borra la cookie, que ya es la del ganador. */
export class RefreshRaceError extends AppError {
  constructor() {
    super('SESSION_INVALID', 'Tu sesión no es válida. Inicia sesión de nuevo.');
  }
}

/** Sesión lista para responder: el refresh token viaja aparte, en la cookie. */
export interface AuthResult {
  session: AuthSessionDto;
  refreshToken: string;
}

async function issueSession(user: User, db: Db = prisma): Promise<AuthResult> {
  const refreshToken = generateToken();
  await sessionRepository.create(
    {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(clock.now().getTime() + REFRESH_TTL_MS),
    },
    db,
  );
  return {
    refreshToken,
    session: {
      accessToken: await signAccessToken(user.id),
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toUserDto(user),
    },
  };
}

/** Token + delivery en la misma transacción; el job se encola después (ver enqueueVerification). */
async function createVerification(user: User, db: Db) {
  const token = generateToken();
  const row = await verificationTokenRepository.create(
    {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(clock.now().getTime() + VERIFICATION_TTL_MS),
    },
    db,
  );
  const delivery = await emailDeliveriesRepository.create(
    {
      userId: user.id,
      kind: 'verify_email',
      recipientEmail: user.email,
      dedupeKey: `verify_email:${row.id}`,
    },
    db,
  );
  return { deliveryId: delivery.id, token, displayName: user.displayName ?? '' };
}

/** Si Redis falla, el registro ya está confirmado: el delivery queda en `queued` y el usuario puede reenviar. */
async function enqueueVerification(job: Awaited<ReturnType<typeof createVerification>>) {
  try {
    await enqueueSendEmail(job);
  } catch (err) {
    logger.error({ deliveryId: job.deliveryId, err }, 'Could not enqueue verification email');
  }
}

export const authService = {
  async register(input: RegisterInput, ip: string): Promise<AuthResult> {
    await consume(`rl:register:${ip}`, 5, HOUR); // R-09

    const passwordHash = await hashPassword(input.password);
    const { user, job } = await prisma.$transaction(async (tx) => {
      const user = await usersService.create(
        {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          timezone: input.timezone,
        },
        tx,
      );
      return { user, job: await createVerification(user, tx) };
    });
    await enqueueVerification(job);

    return issueSession(user);
  },

  async login(input: LoginInput, ip: string): Promise<AuthResult> {
    // El intento se cuenta ANTES de verificar: así 20 peticiones simultáneas no esquivan el límite.
    // La clave usa el hash del correo para no dejar correos en claro en Redis.
    const limitKey = `rl:login:${hashToken(input.email)}:${ip}`;
    await consume(limitKey, 5, 15 * 60);

    const user = await usersService.findByEmail(input.email);
    // Con correo inexistente también se paga una verificación Argon2: el tiempo no delata el correo.
    const valid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await verifyDummyPassword(input.password), false);
    if (!user || !valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    await resetLimit(limitKey);
    return issueSession(user);
  },

  /** Rota el refresh: revoca el recibido y crea otro. Reutilizar uno ya rotado revoca todas las sesiones. */
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    const invalid = () =>
      new AppError('SESSION_INVALID', 'Tu sesión no es válida. Inicia sesión de nuevo.');
    if (!refreshToken) throw invalid();

    const session = await sessionRepository.findByHash(hashToken(refreshToken));
    if (!session) throw invalid();

    const now = clock.now();
    if (session.revokedAt) {
      // Revocada por rotación hace muy poco (lastUsedAt solo se fija al rotar): carrera legítima
      // entre dos refresh simultáneos, no un robo. Se rechaza sin tocar las demás sesiones.
      if (session.lastUsedAt && now.getTime() - session.lastUsedAt.getTime() < REFRESH_RACE_MS) {
        logger.info({ userId: session.userId }, 'Refresh race within margin');
        throw new RefreshRaceError();
      }
      await sessionRepository.revokeAllForUser(session.userId, now);
      logger.warn({ userId: session.userId }, 'Refresh token reuse detected; sessions revoked');
      throw invalid();
    }
    if (session.expiresAt <= now) throw invalid();

    const user = await usersService.findById(session.userId);
    if (!user) throw invalid();

    const result = await prisma.$transaction(async (tx) => {
      const revoked = await sessionRepository.revoke(session.id, now, tx);
      return revoked ? issueSession(user, tx) : null;
    });
    if (!result) {
      logger.info({ userId: user.id }, 'Refresh race within margin');
      throw new RefreshRaceError(); // otra petición rotó este mismo token a la vez
    }
    return result;
  },

  /** Idempotente: sin cookie o con una cookie desconocida no hace nada. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await sessionRepository.revokeByHash(hashToken(refreshToken), clock.now());
  },

  async verifyEmail(token: string): Promise<void> {
    const row = await verificationTokenRepository.findByHash(hashToken(token));
    const now = clock.now();
    if (!row || row.usedAt) {
      throw new AppError('VERIFICATION_TOKEN_INVALID', 'El enlace de verificación no es válido.');
    }
    if (row.expiresAt <= now) {
      throw new AppError(
        'VERIFICATION_TOKEN_EXPIRED',
        'El enlace de verificación venció. Pide uno nuevo.',
      );
    }

    await prisma.$transaction(async (tx) => {
      if (!(await verificationTokenRepository.markUsed(row.id, now, tx))) {
        throw new AppError('VERIFICATION_TOKEN_INVALID', 'El enlace de verificación no es válido.');
      }
      await usersService.markEmailVerified(row.userId, now, tx);
    });
  },

  async resendVerification(userId: number): Promise<void> {
    const user = await usersService.findById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.');
    if (user.emailVerifiedAt) {
      throw new AppError('EMAIL_ALREADY_VERIFIED', 'Tu correo ya está verificado.');
    }
    await consume(`rl:resend:${userId}`, 3, HOUR); // R-09

    const job = await prisma.$transaction(async (tx) => {
      await verificationTokenRepository.invalidateUnused(userId, clock.now(), tx);
      return createVerification(user, tx);
    });
    await enqueueVerification(job);
  },

  /** El worker lo consulta antes de enviar: el enlace sigue vigente si no se usó ni se anuló y el usuario no se verificó. */
  async isVerificationLinkCurrent(tokenId: number): Promise<boolean> {
    const row = await verificationTokenRepository.findById(tokenId);
    if (!row || row.usedAt) return false;
    const user = await usersService.findById(row.userId);
    return !!user && !user.emailVerifiedAt;
  },
};
