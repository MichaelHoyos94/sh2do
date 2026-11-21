import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { tasksRoutes } from '../modules/tasks/tasks.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { env } from '../shared/config/env.js';
import { errorHandler, notFoundHandler } from '../shared/http/error-handler.js';
import { requestId } from '../shared/http/request-id.js';
import { logger } from '../shared/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      // Solo método, ruta y estado: sin cabeceras (cookies, Authorization) ni cuerpos.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/tasks', tasksRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
