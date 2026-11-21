import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { safeRedirect } from '@/lib/redirect';
import { useAuth } from './AuthProvider';

/** Rutas privadas: sin sesión, al inicio de sesión recordando a dónde volver. */
export function RequireAuth() {
  const { status } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'anonymous') {
    const target = pathname + search + hash;
    return <Navigate to={target === '/' ? '/login' : `/login?redirect=${encodeURIComponent(target)}`} replace />;
  }
  return <Outlet />;
}

/** Login y registro: con sesión iniciada se va a `redirect` (si es interno) o a `/`. */
export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'authenticated') return <Navigate to={safeRedirect(params.get('redirect'))} replace />;
  return <Outlet />;
}
