import type { components } from './generated/std-6';
import type { components as std7 } from './generated/std-7';

export type User = components['schemas']['User'];
export type AuthSession = components['schemas']['AuthSession'];
export type RegisterRequest = components['schemas']['RegisterRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type Problem = components['schemas']['Problem'];
export type ForgotPasswordRequest = std7['schemas']['ForgotPasswordRequest'];
export type ResetPasswordRequest = std7['schemas']['ResetPasswordRequest'];
