import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { PageTitle } from '@/components/PageTitle';

/** Marco de las páginas públicas: marca, tarjeta centrada y `main` semántico. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p aria-hidden="true" className="text-center text-3xl font-extrabold tracking-tight text-primary">
        Sh2do
      </p>
      <Card className="space-y-6">
        <PageTitle>{title}</PageTitle>
        {children}
      </Card>
    </main>
  );
}
