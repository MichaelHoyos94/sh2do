import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { createTag, deleteTag, listTags, renameTag } from './tagsApi';

const LIST_KEY = ['tags'] as const;

export const useTags = () =>
  useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => listTags(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Siempre refresca la lista: tras un 404 la etiqueta ya no está en el servidor. */
function useTagMutation<V>(fn: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export const useCreateTag = () => useTagMutation(createTag);
export const useRenameTag = (id: number) => useTagMutation((name: string) => renameTag(id, name));
export const useDeleteTag = (id: number) => useTagMutation(() => deleteTag(id));

export const isTagMissing = (error: unknown) => error instanceof ApiError && error.status === 404;

/** Mensaje para el campo `name` si el error es un 422 o un 409; si no, null. */
export const nameError = (error: unknown) =>
  error instanceof ApiError && (error.status === 422 || error.status === 409)
    ? (error.fieldErrors.find((e) => e.field === 'name')?.message ?? error.message)
    : null;
