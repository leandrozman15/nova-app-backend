import { slotRisk, summarizeWeather, type OwmSlot } from './weather-summary';

const slot = (
  dt: number,
  over: Partial<OwmSlot> & { id?: number } = {},
): OwmSlot => ({
  dt,
  main: { temp: 20 },
  pop: 0,
  wind: { speed: 2 },
  weather: [{ id: over.id ?? 800, description: 'cielo claro', icon: '01d' }],
  ...over,
});

describe('weather-summary', () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  const t = (h: number) => Math.floor(now / 1000) + h * 3600;

  it('clasifica el riesgo de cada franja', () => {
    expect(slotRisk(slot(t(0)))).toBe('none');
    expect(slotRisk(slot(t(0), { id: 211 }))).toBe('storm');
    expect(slotRisk(slot(t(0), { wind: { speed: 15 } }))).toBe('wind'); // 54 km/h
    expect(slotRisk(slot(t(0), { pop: 0.7, id: 500 }))).toBe('rain');
    expect(slotRisk(slot(t(0), { pop: 0.2, rain: { '3h': 6 } }))).toBe('rain');
  });

  it('arma el resumen y la alerta de las próximas 24 h', () => {
    const list = Array.from({ length: 16 }, (_, i) =>
      slot(t(i * 3), i === 2 ? { id: 211, pop: 0.9 } : {}),
    );
    const s = summarizeWeather(
      { list, city: { timezone: -10800 } },
      {
        main: { temp: 24.4, feels_like: 25 },
        wind: { speed: 3 },
        weather: [{ description: 'nubes', icon: '02d' }],
      },
      now,
    );
    expect(s.next24h).toHaveLength(8);
    expect(s.current?.temp).toBe(24);
    expect(s.current?.windKmh).toBe(11);
    expect(s.alert?.risk).toBe('storm');
    expect(s.alert?.from).toBe(new Date(t(6) * 1000).toISOString());
    expect(s.days.length).toBeGreaterThan(1);
  });

  it('sin riesgo no hay alerta', () => {
    const list = Array.from({ length: 8 }, (_, i) => slot(t(i * 3)));
    expect(summarizeWeather({ list }, null, now).alert).toBeNull();
    expect(summarizeWeather({ list }, null, now).current).toBeNull();
  });
});
