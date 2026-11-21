import type { User } from '../../generated/prisma/client.js';

/** DTO de salida: el hash de la contraseña nunca sale de aquí. */
export interface UserDto {
  id: number;
  displayName: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
}

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  displayName: user.displayName ?? '',
  email: user.email,
  emailVerified: user.emailVerifiedAt !== null,
  timezone: user.timezone,
});
