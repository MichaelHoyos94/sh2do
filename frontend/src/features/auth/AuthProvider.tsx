import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, refreshSession, setAccessToken, setSessionLostHandler } from '@/api/client';
import type { LoginRequest, RegisterRequest, User } from '@/api/types';
import { loginWithPassword, logoutSession, registerAccount, resendVerificationEmail } from './authApi';

type AuthContextValue = {
  /** `loading` mientras se intenta restaurar la sesión con el refresh. */
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  resendVerification: () => Promise<void>;
  markEmailVerified: () => void;
  /** Limpia la sesión local sin llamar a /auth/logout (el servidor ya la cerró). */
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionLostHandler(clearSession);
    refreshSession()
      .then((session) => setUser(session.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: loading ? 'loading' : user ? 'authenticated' : 'anonymous',
      user,
      login: async (data) => setUser(await loginWithPassword(data)),
      register: async (data) => setUser(await registerAccount(data)),
      logout: async () => {
        // Cerrar sesión es idempotente: aunque falle la red, el cliente queda sin sesión.
        await logoutSession().catch(() => undefined);
        clearSession();
      },
      resendVerification: async () => {
        try {
          await resendVerificationEmail();
        } catch (error) {
          if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_VERIFIED') {
            setUser((current) => current && { ...current, emailVerified: true });
          }
          throw error;
        }
      },
      markEmailVerified: () => setUser((current) => current && { ...current, emailVerified: true }),
      clearSession,
    }),
    [loading, user, clearSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
