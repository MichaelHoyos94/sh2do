import { Router } from 'express';
import { validateBody } from '../../shared/http/validate.js';
import {
  checkPasswordResetToken,
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendVerificationEmail,
  resetPassword,
  verifyEmail,
} from './auth.controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resetTokenSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import { requireAuth } from './require-auth.middleware.js';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(registerSchema), register);
authRoutes.post('/login', validateBody(loginSchema), login);
authRoutes.post('/refresh', refresh);
authRoutes.post('/logout', logout);
authRoutes.post('/verify-email', validateBody(verifyEmailSchema), verifyEmail);
authRoutes.post('/verification-email', requireAuth, resendVerificationEmail);
authRoutes.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);
authRoutes.post('/reset-password/check', validateBody(resetTokenSchema), checkPasswordResetToken);
authRoutes.post('/reset-password', validateBody(resetPasswordSchema), resetPassword);
