import type { CookieOptions, RequestHandler, Response } from 'express';
import { env } from '../../shared/config/env.js';
import { authService, REFRESH_TTL_MS, RefreshRaceError, type AuthResult } from './auth.service.js';

const COOKIE_NAME = 'sh2do_rt';
// Se lee env en cada uso (no al importar) para poder probar el atributo Secure.
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE,
  path: '/api/v1/auth',
});

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_TTL_MS });

// Max-Age=0 (clearCookie de Express 5 solo envía Expires)
const clearRefreshCookie = (res: Response) =>
  res.cookie(COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 });

const sendSession = (res: Response, status: number, { session, refreshToken }: AuthResult) => {
  setRefreshCookie(res, refreshToken);
  res.status(status).json(session);
};

export const register: RequestHandler = async (req, res) => {
  sendSession(res, 201, await authService.register(req.body, req.ip ?? 'unknown'));
};

export const login: RequestHandler = async (req, res) => {
  sendSession(res, 200, await authService.login(req.body, req.ip ?? 'unknown'));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    sendSession(res, 200, await authService.refresh(req.cookies?.[COOKIE_NAME]));
  } catch (err) {
    // El 401 sale con la cookie borrada, salvo en una carrera: ahí la cookie nueva es la del ganador.
    if (!(err instanceof RefreshRaceError)) clearRefreshCookie(res);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[COOKIE_NAME]);
  clearRefreshCookie(res);
  res.status(204).end();
};

export const verifyEmail: RequestHandler = async (req, res) => {
  await authService.verifyEmail(req.body.token);
  res.json({ emailVerified: true });
};

export const resendVerificationEmail: RequestHandler = async (req, res) => {
  await authService.resendVerification(req.user!.id);
  res.status(202).end();
};
