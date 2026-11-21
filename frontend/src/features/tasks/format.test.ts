import { describe, expect, it } from 'vitest';
import { formatInstant, formatSchedule } from './format';

describe('formatSchedule', () => {
  it('sin fecha dice "Sin fecha"', () => {
    expect(formatSchedule({ scheduledDate: null, scheduledTime: null })).toBe('Sin fecha');
  });

  it('con fecha y hora las une en español, sin correr el día', () => {
    expect(formatSchedule({ scheduledDate: '2026-11-28', scheduledTime: '18:30' })).toBe(
      'sáb, 28 nov 2026 · 18:30',
    );
  });

  it('con fecha sin hora muestra solo la fecha', () => {
    expect(formatSchedule({ scheduledDate: '2026-01-01', scheduledTime: null })).toBe(
      'jue, 1 ene 2026',
    );
  });
});

describe('formatInstant', () => {
  it('muestra el instante en la zona del perfil, no en la del navegador', () => {
    // 03:30 UTC es aún el día anterior en Bogotá (UTC-5).
    expect(formatInstant('2026-11-28T03:30:00Z', 'America/Bogota')).toContain('27 nov 2026');
    expect(formatInstant('2026-11-28T03:30:00Z', 'Europe/Madrid')).toContain('28 nov 2026');
  });
});
