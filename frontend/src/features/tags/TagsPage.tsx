import { useRef, useState, type FormEvent } from 'react';
import { describeError } from '@/api/client';
import { PageTitle } from '@/components/PageTitle';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TagRow } from './TagRow';
import { nameError, useCreateTag, useTags } from './useTags';

export function TagsPage() {
  const list = useTags();
  const create = useCreateTag();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [missing, setMissing] = useState(false);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const tags = list.data?.pages.flatMap((page) => page.items) ?? [];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setMissing(false);
    try {
      await create.mutateAsync(name);
      setName('');
      setFieldError(null);
      setNotice('Etiqueta creada');
    } catch (e) {
      setFieldError(nameError(e) ?? describeError(e));
    }
  }

  // Se vacía al empezar cada acción: si el mismo mensaje se repitiera sin pasar por vacío, el lector no lo anunciaría.
  const start = () => {
    setNotice('');
    setMissing(false);
  };

  const done = (message: string) => setNotice(message);

  // La fila desaparece al refrescar la lista: el foco va al título para no perderse.
  const missingTag = () => {
    setMissing(true);
    listTitle.current?.focus();
  };

  return (
    <div className="space-y-6">
      <PageTitle>Etiquetas</PageTitle>

      <form onSubmit={onSubmit} className="space-y-2" noValidate>
        <Label htmlFor="new-tag">Nueva etiqueta</Label>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <Input
              id="new-tag"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'new-tag-error' : undefined}
            />
            {fieldError && (
              <p id="new-tag-error" role="alert" className="text-sm text-destructive">
                {fieldError}
              </p>
            )}
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear'}
          </Button>
        </div>
      </form>

      <p role="status" className="text-sm font-medium">
        {notice}
      </p>
      {missing && (
        <Alert variant="destructive" role="alert">
          Esta etiqueta no existe.
        </Alert>
      )}

      <h2 ref={listTitle} tabIndex={-1} className="text-lg font-semibold">
        Mis etiquetas
      </h2>

      {list.isPending && (
        <p role="status" className="text-muted-foreground">
          Cargando etiquetas…
        </p>
      )}

      {list.isError && !list.data && (
        <div className="space-y-3">
          <Alert variant="destructive" role="alert">
            {describeError(list.error)}
          </Alert>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && tags.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          Aún no tienes etiquetas.
        </p>
      )}

      {tags.length > 0 && (
        <ul className="space-y-3">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onStart={start}
              onDone={done}
              onMissing={missingTag}
              onDeleted={() => listTitle.current?.focus()}
            />
          ))}
        </ul>
      )}

      {list.isError && list.data && (
        <Alert variant="destructive" role="alert">
          {describeError(list.error)}
        </Alert>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {list.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
}
