import type { components } from './generated/std-6';
import type { components as std7 } from './generated/std-7';
import type { components as std9 } from './generated/std-9';
import type { components as std10 } from './generated/std-10';
import type { components as std11 } from './generated/std-11';

export type User = components['schemas']['User'];
export type AuthSession = components['schemas']['AuthSession'];
export type RegisterRequest = components['schemas']['RegisterRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type Problem = components['schemas']['Problem'];
export type ForgotPasswordRequest = std7['schemas']['ForgotPasswordRequest'];
export type ResetPasswordRequest = std7['schemas']['ResetPasswordRequest'];

export type SetTaskStatusRequest = std9['schemas']['SetTaskStatusRequest'];

export type Task = std11['schemas']['Task'];
export type TaskPage = std11['schemas']['TaskPage'];
export type TaskStatus = std11['schemas']['TaskStatus'];
export type TaskPriority = std11['schemas']['TaskPriority'];
export type TaskTag = std11['schemas']['TaskTag'];
export type CreateTaskRequest = std11['schemas']['CreateTaskRequest'];
export type UpdateTaskRequest = std11['schemas']['UpdateTaskRequest'];

export type Tag = std10['schemas']['Tag'];
export type TagPage = std10['schemas']['TagPage'];
export type TagRequest = std10['schemas']['TagRequest'];
