import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-6">
            <p className="text-xl font-extrabold tracking-tight text-primary">Sh2do</p>
            <nav aria-label="Principal">
              <NavLink
                to="/tasks"
                className="text-sm font-semibold underline-offset-4 hover:underline aria-[current=page]:text-primary aria-[current=page]:underline"
              >
                Pendientes
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="max-w-40 truncate text-sm sm:max-w-xs">{user?.displayName}</span>
            <Button variant="outline" onClick={onLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <VerifyEmailBanner />
        <main id="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
