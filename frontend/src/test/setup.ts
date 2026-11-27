import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { setAccessToken, setSessionLostHandler } from '@/api/client';

// Con cobertura en Docker los renders tardan más: 1 s (el valor por defecto) daba fallos intermitentes.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // El cliente guarda estado de módulo (token y manejador): se reinicia entre pruebas.
  setAccessToken(null);
  setSessionLostHandler(() => {});
  // Los filtros recordados de la lista (taskFilters) no deben pasar de una prueba a otra.
  sessionStorage.clear();
});
