import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-lg border-l-4 px-4 py-3 text-sm', {
  variants: {
    variant: {
      destructive: 'border-destructive bg-destructive-soft text-destructive',
      success: 'border-success bg-success-soft text-success',
      warning: 'border-warning bg-warning-soft text-warning',
    },
  },
  defaultVariants: { variant: 'warning' },
});

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
