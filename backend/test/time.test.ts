import { describe, expect, it } from 'vitest';
import {
  dateColumnToString,
  stringToDateColumn,
  stringToTimeColumn,
  timeColumnToString,
  toUtcInstant,
} from '../src/shared/time.js';

describe('toUtcInstant', () => {
  it('converts a local date and time to UTC with a negative offset (America/Bogota, UTC-5)', () => {
    expect(toUtcInstant('2026-11-28', '18:30', 'America/Bogota')?.toISOString()).toBe(
      '2026-11-28T23:30:00.000Z',
    );
  });

  it('converts with a positive offset and a different day (Asia/Tokyo, UTC+9)', () => {
    expect(toUtcInstant('2026-11-28', '03:00', 'Asia/Tokyo')?.toISOString()).toBe(
      '2026-11-27T18:00:00.000Z',
    );
  });

  it('uses the offset in force on that date (daylight saving time)', () => {
    expect(toUtcInstant('2026-01-15', '12:00', 'America/New_York')?.toISOString()).toBe(
      '2026-01-15T17:00:00.000Z',
    );
    expect(toUtcInstant('2026-07-15', '12:00', 'America/New_York')?.toISOString()).toBe(
      '2026-07-15T16:00:00.000Z',
    );
  });

  it('moves a time skipped by the clock change forward to the first valid hour', () => {
    // 2026-03-08 02:30 no existe en Nueva York: los relojes saltan de 02:00 a 03:00 (UTC-4).
    expect(toUtcInstant('2026-03-08', '02:30', 'America/New_York')?.toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('returns null without a date or without a time', () => {
    expect(toUtcInstant(null, null, 'America/Bogota')).toBeNull();
    expect(toUtcInstant('2026-11-28', null, 'America/Bogota')).toBeNull();
    expect(toUtcInstant(null, '18:30', 'America/Bogota')).toBeNull();
  });

  it('fails loudly on an invalid zone instead of guessing', () => {
    expect(() => toUtcInstant('2026-11-28', '18:30', 'Not/AZone')).toThrow();
  });
});

describe('DATE and TIME column helpers', () => {
  it('round-trips YYYY-MM-DD and HH:mm through the Prisma representation', () => {
    expect(dateColumnToString(stringToDateColumn('2026-02-28'))).toBe('2026-02-28');
    expect(timeColumnToString(stringToTimeColumn('07:05'))).toBe('07:05');
  });

  it('keeps null as null', () => {
    expect(stringToDateColumn(null)).toBeNull();
    expect(stringToTimeColumn(null)).toBeNull();
    expect(dateColumnToString(null)).toBeNull();
    expect(timeColumnToString(null)).toBeNull();
  });
});
