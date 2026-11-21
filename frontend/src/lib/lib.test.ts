import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeRedirect, withRedirect } from './redirect';
import { detectTimezone } from './timezone';

describe('safeRedirect', () => {
  it('acepta rutas internas', () => {
    expect(safeRedirect('/plans/3?x=1')).toBe('/plans/3?x=1');
  });

  it.each([null, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'plans'])('rechaza %j y vuelve a /', (value) => {
    expect(safeRedirect(value)).toBe('/');
  });
});

describe('withRedirect', () => {
  it('conserva solo un redirect interno válido', () => {
    expect(withRedirect('/login', '/planes/3')).toBe('/login?redirect=%2Fplanes%2F3');
    expect(withRedirect('/login', '//evil.com')).toBe('/login');
    expect(withRedirect('/login', null)).toBe('/login');
  });
});

describe('detectTimezone', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa la zona del navegador cuando es válida', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'America/Bogota',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectTimezone()).toBe('America/Bogota');
  });

  it('cae a UTC si la zona es inválida o falta', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions');
    spy.mockReturnValue({ timeZone: 'Mars/Olympus' } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectTimezone()).toBe('UTC');
    spy.mockReturnValue({ timeZone: undefined } as unknown as Intl.ResolvedDateTimeFormatOptions);
    expect(detectTimezone()).toBe('UTC');
  });
});
