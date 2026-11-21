import request from 'supertest';
import { createApp } from '../src/api/app.js';

const app = createApp();
export const http = () => request(app);

export const validRegistration = (overrides: Record<string, unknown> = {}) => ({
  displayName: 'Ana',
  email: 'ana@example.com',
  password: 'correct horse battery',
  timezone: 'America/Bogota',
  ...overrides,
});

/** Valor de la cookie del refresh token en una respuesta, o undefined si no viene. */
export function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = (res.headers['set-cookie'] ?? []) as string[];
  return cookies
    .find((c) => c.startsWith('sh2do_rt='))
    ?.split(';')[0]
    ?.slice('sh2do_rt='.length);
}

export async function registerUser(overrides: Record<string, unknown> = {}) {
  const res = await http().post('/api/v1/auth/register').send(validRegistration(overrides));
  return {
    res,
    accessToken: res.body.accessToken as string,
    refreshToken: refreshCookie(res) as string,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const withRefresh = (token: string) => ({ Cookie: `sh2do_rt=${token}` });
