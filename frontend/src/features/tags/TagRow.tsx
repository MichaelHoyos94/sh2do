import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { describeError } from '@/api/client';
import type { Tag } from '@/api/types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isTagMissing, nameError, useDeleteTag, useRenameTag } from './useTags';

type Mode = 'view' | 'edit' | 'confirm';
type Props = {
  tag: Tag;
  onStart: () => void;
  onDone: (message: string) => void;
  onMissing: () => void;
  onDeleted: () => void;
};

export function TagRow({ tag, onStart, onDone, onMissing, onDeleted }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const rename = useRenameTag(tag.id);
  const remove = useDeleteTag(tag.id);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const renameBtn = useRef<HTMLButtonElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<'rename' | 'delete' | null>(null);

  // El foco sigue al cambio de modo: al campo, a "Cancelar" o de vuelta al botón que lo abrió.
  useEffect(() => {
    if (mode === 'edit') {
      input.current?.focus();
      input.current?.select();
    } else if (mode === 'confirm') cancel.current?.focus();
    else if (returnTo.current) {
      (returnTo.current === 'rename' ? renameBtn : deleteBtn).current?.focus();
      returnTo.current = null;
    }
  }, [mode]);

  const close = (from: 'rename' | 'delete') => {
    returnTo.current = from;
    setError(null);
    setMode('view');
  };

  // Un 404 va a la alerta de la página: la fila desaparece al refrescar la lista.
  const fail = (e: unknown) => {
    if (isTagMissing(e)) onMissing();
    else setError(nameError(e) ?? describeError(e));
  };

  async function onSave(event: FormEvent) {
    event.preventDefault();
    onStart();
    try {
      await rename.mutateAsync(name);
      close('rename');
      onDone('Etiqueta renombrada');
    } catch (e) {
      fail(e);
    }
  }

  async function onConfirmDelete() {
    onStart();
    try {
      await remove.mutateAsync();
      onDone('Etiqueta eliminada');
      onDeleted();
    } catch (e) {
      fail(e);
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close('rename');
  };

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {mode === 'edit' ? (
        <form onSubmit={onSave} onKeyDown={onKeyDown} className="space-y-3" noValidate>
          <Label htmlFor={`tag-name-${tag.id}`} className="sr-only">
            Nuevo nombre para «{tag.name}»
          </Label>
          <Input
            id={`tag-name-${tag.id}`}
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `tag-error-${tag.id}` : undefined}
          />
          {error && (
            <p id={`tag-error-${tag.id}`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="outline" onClick={() => close('rename')}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 break-words text-lg font-semibold">{tag.name}</span>
          {mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              <Button
                ref={renameBtn}
                variant="outline"
                aria-label={`Renombrar ${tag.name}`}
                onClick={() => {
                  setName(tag.name);
                  setMode('edit');
                }}
              >
                Renombrar
              </Button>
              <Button
                ref={deleteBtn}
                variant="outline"
                aria-label={`Eliminar ${tag.name}`}
                onClick={() => setMode('confirm')}
              >
                Eliminar
              </Button>
            </div>
          )}
        </div>
      )}
      {mode === 'confirm' && (
        <div className="space-y-3">
          <p>¿Eliminar «{tag.name}»? Se quitará de tus pendientes; los pendientes no se borran.</p>
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={remove.isPending} onClick={() => void onConfirmDelete()}>
              {remove.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
            <Button ref={cancel} variant="outline" onClick={() => close('delete')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
