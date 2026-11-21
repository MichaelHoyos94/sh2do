import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** h1 de la página: al montarse recibe el foco y fija el título del documento (cambio de ruta accesible). */
export function PageTitle({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus();
    document.title = `${children} · Sh2do`;
  }, [children]);

  return (
    <h1 ref={ref} tabIndex={-1} className={cn('text-2xl font-bold tracking-tight', className)}>
      {children}
    </h1>
  );
}
