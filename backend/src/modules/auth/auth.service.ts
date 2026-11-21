import type { User } from '../../generated/prisma/client.js';
import { clock } from '../../shared/clock.js';
import { prisma, type Db } from '../../shared/db/prisma.js';
import { AppError } from '../../shared/http/problem.js';
import { logger } from '../../shared/logger.js';
import { emailDeliveriesRepository } from '../../shared/mail/email-deliveries.repository.js';
import { enqueueSendEmail, type SendEmailJob } from '../../shared/queue/queues.js';
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
import type {
  AuthSessionDto,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schemas.js';
import { passwordResetTokenRepository } from './password-reset-token.repository.js';
import { sessionRepository } from './session.repository.js';
import { verificationTokenRepository } from './verification-token.repository.js';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // R-08: 30 días deslizantes
const REFRESH_RACE_MS = 10_000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // R-05
const RESET_TTL_MS = 24 * 60 * 60 * 1000; // R-02
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

/** Token + delivery en la misma transacción; el job se encola después (ver enqueueEmail). */
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

/** Si Redis falla, el registro durable ya está confirmado: el delivery queda en `queued` y la reconciliación o un reenvío lo recuperan. */
async function enqueueEmail(job: SendEmailJob) {
  try {
    await enqueueSendEmail(job);
  } catch (err) {
    logger.error({ deliveryId: job.deliveryId, err }, 'Could not enqueue email');
  }
}

/** Token de recuperación + delivery en la misma transacción; el job se encola después. */
async function createPasswordReset(user: User, db: Db): Promise<SendEmailJob> {
  const token = generateToken();
  const row = await passwordResetTokenRepository.create(
    {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(clock.now().getTime() + RESET_TTL_MS),
    },
    db,
  );
  const delivery = await emailDeliveriesRepository.create(
    {
      userId: user.id,
      kind: 'reset_password',
      recipientEmail: user.email,
      dedupeKey: `reset_password:${row.id}`,
    },
    db,
  );
  return { deliveryId: delivery.id, token, displayName: user.displayName ?? '' };
}

/** Enlace vigente: existe, no se usó ni se anuló y no venció. Si no, 400 con su código. */
async function findUsableResetToken(token: string) {
  const row = await passwordResetTokenRepository.findByHash(hashToken(token));
  if (!row || row.usedAt) {
    throw new AppError('PASSWORD_RESET_TOKEN_INVALID', 'El enlace de recuperación no es válido.');
  }
  if (row.expiresAt <= clock.now()) {
    throw new AppError(
      'PASSWORD_RESET_TOKEN_EXPIRED',
      'El enlace de recuperación venció o ya se usó. Pide uno nuevo.',
    );
  }
  return row;
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
    await enqueueEmail(job);

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
    await enqueueEmail(job);
  },

  /** El worker lo consulta antes de enviar: el enlace sigue vigente si no se usó ni se anuló y el usuario no se verificó. */
  async isVerificationLinkCurrent(tokenId: number): Promise<boolean> {
    const row = await verificationTokenRepository.findById(tokenId);
    if (!row || row.usedAt) return false;
    const user = await usersService.findById(row.userId);
    return !!user && !user.emailVerifiedAt;
  },

  /** Respuesta genérica (R-01): nunca revela si el correo tiene cuenta. */
  async requestPasswordReset(input: ForgotPasswordInput, ip: string): Promise<void> {
    await consume(`rl:pwreset:ip:${ip}`, 10, HOUR); // R-03
    // Cuenta igual exista o no la cuenta, y la clave no deja correos en claro en Redis.
    await consume(`rl:pwreset:${hashToken(input.email)}`, 3, HOUR);

    const user = await usersService.findByEmail(input.email);
    if (!user) return;

    const job = await prisma.$transaction(async (tx) => {
      await passwordResetTokenRepository.invalidateUnused(user.id, clock.now(), tx);
      return createPasswordReset(user, tx);
    });
    await enqueueEmail(job);
  },

  async checkPasswordResetToken(token: string): Promise<void> {
    await findUsableResetToken(token);
  },

  async resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
    const row = await findUsableResetToken(token);
    const user = await usersService.findById(row.userId);
    if (!user) {
      throw new AppError('PASSWORD_RESET_TOKEN_INVALID', 'El enlace de recuperación no es válido.');
    }
    const passwordHash = await hashPassword(password);

    const now = clock.now();
    const job = await prisma.$transaction(async (tx) => {
      // Un solo uso real: si dos peticiones llegan a la vez, solo una gana este UPDATE.
      if (!(await passwordResetTokenRepository.markUsed(row.id, now, tx))) {
        throw new AppError(
          'PASSWORD_RESET_TOKEN_INVALID',
          'El enlace de recuperación no es válido.',
        );
      }
      await usersService.updatePassword(user.id, passwordHash, tx);
      await passwordResetTokenRepository.invalidateUnused(user.id, now, tx);
      await sessionRepository.revokeAllForUser(user.id, now, tx);
      // Haber recibido el correo demuestra que la cuenta es suya (R-06).
      if (!user.emailVerifiedAt) await usersService.markEmailVerified(user.id, now, tx);
      const delivery = await emailDeliveriesRepository.create(
        {
          userId: user.id,
          kind: 'password_changed',
          recipientEmail: user.email,
          dedupeKey: `password_changed:${row.id}`,
        },
        tx,
      );
      return { deliveryId: delivery.id, displayName: user.displayName ?? '' };
    });
    await enqueueEmail(job);
  },

  /** El worker lo consulta antes de enviar: el enlace sigue vigente si no se usó ni se anuló. */
  async isPasswordResetLinkCurrent(tokenId: number): Promise<boolean> {
    const row = await passwordResetTokenRepository.findById(tokenId);
    return !!row && !row.usedAt && row.expiresAt > clock.now();
  },
};
