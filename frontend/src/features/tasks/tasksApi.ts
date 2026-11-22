import { request } from '@/api/client';
import type { CreateTaskRequest, Task, TaskPage, UpdateTaskRequest } from '@/api/types';

export const listTasks = (cursor?: string | null) =>
  request<TaskPage>('GET', cursor ? `/tasks?cursor=${encodeURIComponent(cursor)}` : '/tasks', {
    auth: true,
  });
export const getTask = (id: number) => request<Task>('GET', `/tasks/${id}`, { auth: true });
export const createTask = (data: CreateTaskRequest) =>
  request<Task>('POST', '/tasks', { auth: true, body: data });
export const updateTask = (id: number, data: UpdateTaskRequest) =>
  request<Task>('PATCH', `/tasks/${id}`, { auth: true, body: data });
