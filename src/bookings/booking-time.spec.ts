import {
  addDays,
  bookingWindow,
  dayAbbr,
  isIsoDate,
  roundMoney,
  todayIn,
  zonedToUtc,
} from './booking-time';

describe('booking-time', () => {
  it('converts a local club hour to UTC (Buenos Aires, UTC-3)', () => {
    expect(
      zonedToUtc(
        '2026-10-20',
        18,
        'America/Argentina/Buenos_Aires',
      ).toISOString(),
    ).toBe('2026-10-20T21:00:00.000Z');
    expect(
      zonedToUtc(
        '2026-10-20',
        23,
        'America/Argentina/Buenos_Aires',
      ).toISOString(),
    ).toBe('2026-10-21T02:00:00.000Z');
  });

  it('handles daylight saving zones', () => {
    // Madrid: CEST (UTC+2) en julio, CET (UTC+1) en enero.
    expect(zonedToUtc('2026-07-01', 10, 'Europe/Madrid').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
    expect(zonedToUtc('2026-01-15', 10, 'Europe/Madrid').toISOString()).toBe(
      '2026-01-15T09:00:00.000Z',
    );
  });

  it('computes today and the booking window in the club zone', () => {
    const lateNightUtc = new Date('2026-10-21T01:30:00Z'); // 22:30 del 20 en Buenos Aires
    expect(todayIn('America/Argentina/Buenos_Aires', lateNightUtc)).toBe(
      '2026-10-20',
    );
    const window = bookingWindow(
      'America/Argentina/Buenos_Aires',
      lateNightUtc,
    );
    expect(window).toHaveLength(14);
    expect(window[0]).toBe('2026-10-20');
    expect(window[13]).toBe('2026-11-02');
  });

  it('validates dates and weekday names used by fixed rentals', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-10-20')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayAbbr('2026-10-19')).toBe('Lun');
    expect(dayAbbr('2026-10-25')).toBe('Dom');
    expect(roundMoney(12000 * 0.3333)).toBe(3999.6);
  });
});
