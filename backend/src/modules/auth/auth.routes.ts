import { Router } from 'express';
import { validateBody } from '../../shared/http/validate.js';
import {
  login,
  logout,
  refresh,
  register,
  resendVerificationEmail,
  verifyEmail,
} from './auth.controller.js';
import { loginSchema, registerSchema, verifyEmailSchema } from './auth.schemas.js';
import { requireAuth } from './require-auth.middleware.js';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(registerSchema), register);
authRoutes.post('/login', validateBody(loginSchema), login);
authRoutes.post('/refresh', refresh);
authRoutes.post('/logout', logout);
authRoutes.post('/verify-email', validateBody(verifyEmailSchema), verifyEmail);
authRoutes.post('/verification-email', requireAuth, resendVerificationEmail);
