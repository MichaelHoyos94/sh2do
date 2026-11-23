import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/RouteGuards';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { EditTaskPage } from '@/features/tasks/EditTaskPage';
import { NewTaskPage } from '@/features/tasks/NewTaskPage';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { TagsPage } from '@/features/tags/TagsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AppLayout } from './AppLayout';

export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Pública y sin guardas: funciona con o sin sesión.
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    // Todo lo demás es privado; sin sesión incluso una URL inexistente va a /login.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/tasks" replace /> },
          { path: '/tasks', element: <TasksPage /> },
          { path: '/tasks/new', element: <NewTaskPage /> },
          { path: '/tasks/:taskId', element: <TaskDetailPage /> },
          { path: '/tasks/:taskId/edit', element: <EditTaskPage /> },
          { path: '/tags', element: <TagsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
