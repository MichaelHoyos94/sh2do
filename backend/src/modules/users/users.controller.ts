import type { RequestHandler } from 'express';
import { usersService } from './users.service.js';

export const getCurrentUser: RequestHandler = async (req, res) => {
  res.json(await usersService.getCurrent(req.user!.id));
};
