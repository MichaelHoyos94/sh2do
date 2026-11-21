/** Solo se aceptan rutas internas: empiezan por "/" y no por "//" (ni "/\\", que el navegador trata igual). */
export function safeRedirect(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

/** Añade `?redirect=` a un enlace interno solo si el valor es una ruta interna válida distinta de `/`. */
export function withRedirect(path: string, value: string | null | undefined): string {
  const target = safeRedirect(value);
  return target === '/' ? path : `${path}?redirect=${encodeURIComponent(target)}`;
}
