import { pino } from 'pino';
import { env } from './config/env.js';

// Nunca se registran contraseñas, tokens, cookies ni la cabecera Authorization.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['password', 'token', '*.password', '*.token', 'req.headers', 'res.headers'],
    censor: '[REDACTED]',
  },
});
