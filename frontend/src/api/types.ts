import type { components } from './generated/std-6';
import type { components as std7 } from './generated/std-7';
import type { components as std8 } from './generated/std-8';

export type User = components['schemas']['User'];
export type AuthSession = components['schemas']['AuthSession'];
export type RegisterRequest = components['schemas']['RegisterRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type Problem = components['schemas']['Problem'];
export type ForgotPasswordRequest = std7['schemas']['ForgotPasswordRequest'];
export type ResetPasswordRequest = std7['schemas']['ResetPasswordRequest'];

export type Task = std8['schemas']['Task'];
export type TaskPage = std8['schemas']['TaskPage'];
export type TaskStatus = std8['schemas']['TaskStatus'];
export type TaskPriority = std8['schemas']['TaskPriority'];
export type CreateTaskRequest = std8['schemas']['CreateTaskRequest'];
export type UpdateTaskRequest = std8['schemas']['UpdateTaskRequest'];
