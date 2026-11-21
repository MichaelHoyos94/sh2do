import { createBrowserRouter, type RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/RouteGuards';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AppLayout } from './AppLayout';

export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  // Pública y sin guardas: funciona con o sin sesión.
  { path: '/verify-email', element: <VerifyEmailPage /> },
  {
    // Todo lo demás es privado; sin sesión incluso una URL inexistente va a /login.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
