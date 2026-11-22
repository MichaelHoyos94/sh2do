import { Router, type RequestHandler } from 'express';
import { AppError } from '../../shared/http/problem.js';
import { validateBody, validateQuery } from '../../shared/http/validate.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { createTask, getTask, listTasks, setTaskStatus, updateTask } from './tasks.controller.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  setTaskStatusSchema,
  taskIdParamSchema,
  updateTaskSchema,
} from './tasks.schemas.js';

/** Un id que no es un entero positivo no puede ser de nadie: 404 como uno inexistente, y antes de validar el body. */
const validateTaskId: RequestHandler = (req, _res, next) => {
  if (!taskIdParamSchema.safeParse(req.params.taskId).success) {
    return next(new AppError('NOT_FOUND', 'Este pendiente no existe.'));
  }
  next();
};

// Sin DELETE: los pendientes no se eliminan (product.md D-01).
export const tasksRoutes = Router();

tasksRoutes.use(requireAuth);
tasksRoutes.get('/', validateQuery(listTasksQuerySchema), listTasks);
tasksRoutes.post('/', validateBody(createTaskSchema), createTask);
tasksRoutes.get('/:taskId', validateTaskId, getTask);
tasksRoutes.patch('/:taskId', validateTaskId, validateBody(updateTaskSchema), updateTask);
tasksRoutes.put(
  '/:taskId/status',
  validateTaskId,
  validateBody(setTaskStatusSchema),
  setTaskStatus,
);
