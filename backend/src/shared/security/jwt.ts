import { jwtVerify, SignJWT } from 'jose';
import { clock } from '../clock.js';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 900;

const key = new TextEncoder().encode(env.JWT_SECRET);

export async function signAccessToken(userId: number): Promise<string> {
  const iat = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}

/** Devuelve el id del usuario, o lanza si el token es inválido o venció. */
export async function verifyAccessToken(token: string): Promise<number> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    currentDate: clock.now(),
  });
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) throw new Error('Invalid subject');
  return userId;
}
