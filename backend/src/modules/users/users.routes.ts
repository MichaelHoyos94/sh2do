import { Router } from 'express';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { getCurrentUser } from './users.controller.js';

export const usersRoutes = Router();

usersRoutes.get('/me', requireAuth, getCurrentUser);
