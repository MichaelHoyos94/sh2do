import { PageTitle } from '@/components/PageTitle';
import { useAuth } from '@/features/auth/AuthProvider';

export function HomePage() {
  const { user } = useAuth();
  return (
    <div className="space-y-2">
      <PageTitle>{`Hola, ${user?.displayName ?? ''}`}</PageTitle>
      <p className="text-muted-foreground">Tu sesión está iniciada. Aquí vivirán tus pendientes y planes.</p>
    </div>
  );
}
