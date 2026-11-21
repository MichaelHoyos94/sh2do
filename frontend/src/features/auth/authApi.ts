import { request, setAccessToken } from '@/api/client';
import type { AuthSession, ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest } from '@/api/types';

async function startSession(path: string, body: unknown) {
  const session = await request<AuthSession>('POST', path, { body });
  setAccessToken(session.accessToken);
  return session.user;
}

export const registerAccount = (data: RegisterRequest) => startSession('/auth/register', data);
export const loginWithPassword = (data: LoginRequest) => startSession('/auth/login', data);
export const verifyEmail = (token: string) => request('POST', '/auth/verify-email', { body: { token } });
export const resendVerificationEmail = () => request('POST', '/auth/verification-email', { auth: true });
export const logoutSession = () => request('POST', '/auth/logout');
export const forgotPassword = (data: ForgotPasswordRequest) => request('POST', '/auth/forgot-password', { body: data });
export const checkResetToken = (token: string) => request('POST', '/auth/reset-password/check', { body: { token } });
export const resetPassword = (data: ResetPasswordRequest) => request('POST', '/auth/reset-password', { body: data });
