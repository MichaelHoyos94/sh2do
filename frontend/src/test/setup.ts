import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { setAccessToken, setSessionLostHandler } from '@/api/client';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // El cliente guarda estado de módulo (token y manejador): se reinicia entre pruebas.
  setAccessToken(null);
  setSessionLostHandler(() => {});
});
