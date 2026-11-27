import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import type { Task, TaskStatus } from '@/api/types';
import type { TaskFilters } from './taskFilters';
import { createTask, getTask, listTasks, setTaskStatus, updateTask } from './tasksApi';

const TASKS_KEY = ['tasks'] as const;
const LIST_KEY = [...TASKS_KEY, 'list'] as const;

export const useTaskList = (filters: TaskFilters) =>
  useInfiniteQuery({
    queryKey: [...LIST_KEY, filters],
    queryFn: ({ pageParam }) => listTasks(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Un id que no es un entero positivo se trata como inexistente, sin llamar a la API. */
export const parseTaskId = (raw: string | undefined) =>
  raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;

export const useTask = (id: number | null) =>
  useQuery({ queryKey: [...TASKS_KEY, id], queryFn: () => getTask(id!), enabled: id !== null });

/** true si el pendiente no existe: id inválido o 404 del servidor. */
export const isTaskNotFound = (id: number | null, error: unknown) =>
  id === null || (error instanceof ApiError && error.status === 404);

/** Deja el detalle ya cargado con la respuesta y marca la lista como obsoleta. */
function useSaveTask<V>(save: (variables: V) => Promise<Task>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: (task) => {
      queryClient.setQueryData([...TASKS_KEY, task.id], task);
      // Solo las listas (con cualquier filtro); el detalle del pendiente guardado ya está al día.
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export const useCreateTask = () => useSaveTask(createTask);
export const useUpdateTask = (id: number) =>
  useSaveTask((data: Parameters<typeof updateTask>[1]) => updateTask(id, data));
export const useSetTaskStatus = (id: number) =>
  useSaveTask((status: TaskStatus) => setTaskStatus(id, status));
