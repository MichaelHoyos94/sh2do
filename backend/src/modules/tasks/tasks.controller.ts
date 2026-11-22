import type { RequestHandler } from 'express';
import type { ListTasksQuery } from './tasks.schemas.js';
import { tasksService } from './tasks.service.js';

export const listTasks: RequestHandler = async (req, res) => {
  // validateQuery ya dejó en req.query el resultado de Zod.
  res.json(await tasksService.list(req.user!.id, req.query as unknown as ListTasksQuery));
};

export const createTask: RequestHandler = async (req, res) => {
  const task = await tasksService.create(req.user!.id, req.body);
  res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
};

// En las rutas con :taskId, validateTaskId ya garantizó que es un entero positivo.
export const getTask: RequestHandler = async (req, res) => {
  res.json(await tasksService.getOwned(req.user!.id, Number(req.params.taskId)));
};

export const updateTask: RequestHandler = async (req, res) => {
  res.json(await tasksService.update(req.user!.id, Number(req.params.taskId), req.body));
};

export const setTaskStatus: RequestHandler = async (req, res) => {
  res.json(await tasksService.setStatus(req.user!.id, Number(req.params.taskId), req.body.status));
};
