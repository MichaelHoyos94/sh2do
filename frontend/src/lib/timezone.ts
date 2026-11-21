/** Zona IANA del navegador; si falta o no es válida, `UTC`. */
export function detectTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      new Intl.DateTimeFormat(undefined, { timeZone: zone });
      return zone;
    }
  } catch {
    // Zona inválida: se usa el valor por defecto.
  }
  return 'UTC';
}
