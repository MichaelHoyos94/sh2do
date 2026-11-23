import { request } from '@/api/client';
import type { Tag, TagPage, TagRequest } from '@/api/types';

export const listTags = (cursor?: string | null) =>
  request<TagPage>('GET', cursor ? `/tags?cursor=${encodeURIComponent(cursor)}` : '/tags', {
    auth: true,
  });
export const createTag = (name: string) =>
  request<Tag>('POST', '/tags', { auth: true, body: { name } satisfies TagRequest });
export const renameTag = (id: number, name: string) =>
  request<Tag>('PATCH', `/tags/${id}`, { auth: true, body: { name } satisfies TagRequest });
export const deleteTag = (id: number) => request('DELETE', `/tags/${id}`, { auth: true });
