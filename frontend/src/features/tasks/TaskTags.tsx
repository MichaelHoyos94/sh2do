import type { Task } from '@/api/types';
import { Badge } from '@/components/ui/badge';

/** Etiquetas del pendiente; no pinta nada si no tiene. */
export function TaskTags({ tags }: Pick<Task, 'tags'>) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Etiquetas" className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge className="break-all">{tag.name}</Badge>
        </li>
      ))}
    </ul>
  );
}
