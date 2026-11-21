import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground aria-[invalid=true]:border-destructive aria-[invalid=true]:border-2',
        className,
      )}
      {...props}
    />
  );
}
