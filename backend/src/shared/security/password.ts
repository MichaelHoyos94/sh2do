import argon2 from 'argon2';

// Parámetros por defecto de la librería (m = 64 MiB, t = 3, p = 4).
export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  argon2.verify(hash, password);

let dummyHash: Promise<string> | undefined;

/** Gasta el mismo tiempo que una verificación real, para que el login no revele qué correos existen. */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword('sh2do-dummy-password');
  await verifyPassword(await dummyHash, password);
}
