import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { empty, mockApi } from '@/test/utils';
import { useDeleteTag } from './useTags';

describe('useTags', () => {
  it('R-12: eliminar una etiqueta deja obsoletas las consultas de pendientes', async () => {
    mockApi({ 'DELETE /tags/1': () => empty(204) });
    const client = new QueryClient();
    const listKey = ['tasks', 'list', { status: [], priority: [], tagIds: [] }];
    client.setQueryData(listKey, {});
    client.setQueryData(['tasks', 7], {});
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteTag(1), { wrapper });

    result.current.mutate();

    await waitFor(() => {
      expect(client.getQueryState(['tasks', 7])?.isInvalidated).toBe(true);
      expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    });
  });
});
