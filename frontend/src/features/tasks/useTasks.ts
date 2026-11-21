import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import type { Task } from '@/api/types';
import { createTask, getTask, listTasks, updateTask } from './tasksApi';

const LIST_KEY = ['tasks'] as const;

export const useTaskList = () =>
  useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => listTasks(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Un id que no es un entero positivo se trata como inexistente, sin llamar a la API. */
export const parseTaskId = (raw: string | undefined) =>
  raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;

export const useTask = (id: number | null) =>
  useQuery({ queryKey: [...LIST_KEY, id], queryFn: () => getTask(id!), enabled: id !== null });

/** true si el pendiente no existe: id inválido o 404 del servidor. */
export const isTaskNotFound = (id: number | null, error: unknown) =>
  id === null || (error instanceof ApiError && error.status === 404);

/** Deja el detalle ya cargado con la respuesta y marca la lista como obsoleta. */
function useSaveTask<V>(save: (variables: V) => Promise<Task>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: (task) => {
      queryClient.setQueryData([...LIST_KEY, task.id], task);
      // `exact`: solo la lista; el detalle del pendiente guardado ya está al día.
      void queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
    },
  });
}

export const useCreateTask = () => useSaveTask(createTask);
export const useUpdateTask = (id: number) =>
  useSaveTask((data: Parameters<typeof updateTask>[1]) => updateTask(id, data));
