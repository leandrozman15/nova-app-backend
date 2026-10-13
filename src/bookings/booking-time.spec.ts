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

describe('turnos por minutos', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const t = require('./booking-time');

  it('converts minutes in the club zone, including midnight', () => {
    const tz = 'America/Argentina/Buenos_Aires';
    expect(t.zonedMinuteToUtc('2026-10-20', 1290, tz).toISOString()).toBe(
      '2026-10-21T00:30:00.000Z',
    );
    expect(t.zonedMinuteToUtc('2026-10-20', 1440, tz).toISOString()).toBe(
      '2026-10-21T03:00:00.000Z',
    );
    expect(t.minuteLabel(1290)).toBe('21:30');
    expect(t.minuteLabel(1440)).toBe('00:00');
    expect(t.weekdayOf('2026-10-20')).toBe(2);
  });

  it('offers 30-minute starts that fit and do not overlap', () => {
    const times = t.computeTimes({
      open: 1080,
      close: 1440,
      duration: 90,
      taken: [[1260, 1320]],
      nowMinute: null,
    });
    const labels = (status: string) =>
      times
        .filter((time: { status: string }) => time.status === status)
        .map((time: { label: string }) => time.label);
    expect(times[0].label).toBe('18:00');
    expect(times.at(-1).label).toBe('22:30');
    expect(labels('taken')).toEqual(['20:00', '20:30', '21:00', '21:30']);
  });

  it('marks started times as past today', () => {
    const times = t.computeTimes({
      open: 1080,
      close: 1200,
      duration: 60,
      taken: [],
      nowMinute: 1100,
    });
    expect(times.map((time: { status: string }) => time.status)).toEqual([
      'past',
      'free',
      'free',
    ]);
  });
});
