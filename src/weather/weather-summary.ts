/** Resumen del pronóstico de OpenWeatherMap (plan gratis: /weather y /forecast cada 3 h). */

export type OwmSlot = {
  dt: number;
  main: { temp: number; feels_like?: number };
  pop?: number;
  wind?: { speed?: number; gust?: number };
  weather: Array<{ id: number; description: string; icon: string }>;
  rain?: { '3h'?: number };
};

export type WeatherRisk = 'none' | 'rain' | 'storm' | 'wind';

export type WeatherHour = {
  time: string;
  temp: number;
  popPct: number;
  windKmh: number;
  rainMm: number;
  description: string;
  icon: string;
  risk: WeatherRisk;
};

export type WeatherSummary = {
  updatedAt: string;
  current: {
    temp: number;
    feelsLike: number;
    windKmh: number;
    description: string;
    icon: string;
  } | null;
  next24h: WeatherHour[];
  days: Array<{
    date: string;
    min: number;
    max: number;
    popPct: number;
    description: string;
    icon: string;
    risk: WeatherRisk;
  }>;
  alert: { risk: WeatherRisk; message: string; from: string } | null;
};

const kmh = (ms?: number) => Math.round((ms ?? 0) * 3.6);

export function slotRisk(s: OwmSlot): WeatherRisk {
  const id = s.weather[0]?.id ?? 800;
  const pop = s.pop ?? 0;
  const mm = s.rain?.['3h'] ?? 0;
  const wind = kmh(Math.max(s.wind?.speed ?? 0, s.wind?.gust ?? 0));
  if (id >= 200 && id < 300) return 'storm';
  if (wind >= 50) return 'wind';
  if ((id >= 500 && id < 600 && pop >= 0.5) || pop >= 0.6 || mm >= 5)
    return 'rain';
  return 'none';
}

const RANK: Record<WeatherRisk, number> = {
  none: 0,
  rain: 1,
  wind: 2,
  storm: 3,
};
const worst = (a: WeatherRisk, b: WeatherRisk) => (RANK[b] > RANK[a] ? b : a);

const MESSAGE: Record<WeatherRisk, string> = {
  none: '',
  rain: 'Hay probabilidad de lluvia: conviene avisar y tener un plan para las canchas descubiertas.',
  wind: 'Se esperan vientos fuertes: puede afectar las actividades al aire libre.',
  storm:
    'Se esperan tormentas eléctricas: no se recomienda usar canchas descubiertas.',
};

const dayKey = (dt: number, tzOffsetSec: number) =>
  new Date((dt + tzOffsetSec) * 1000).toISOString().slice(0, 10);

export function summarizeWeather(
  forecast: { list: OwmSlot[]; city?: { timezone?: number } },
  current: {
    main?: { temp: number; feels_like?: number };
    wind?: { speed?: number };
    weather?: Array<{ description: string; icon: string }>;
  } | null,
  now = Date.now(),
): WeatherSummary {
  const tz = forecast.city?.timezone ?? 0;
  const upcoming = forecast.list.filter(
    (s) => s.dt * 1000 >= now - 3 * 3600_000,
  );

  const next24h: WeatherHour[] = upcoming.slice(0, 8).map((s) => ({
    time: new Date(s.dt * 1000).toISOString(),
    temp: Math.round(s.main.temp),
    popPct: Math.round((s.pop ?? 0) * 100),
    windKmh: kmh(Math.max(s.wind?.speed ?? 0, s.wind?.gust ?? 0)),
    rainMm: Math.round((s.rain?.['3h'] ?? 0) * 10) / 10,
    description: s.weather[0]?.description ?? '',
    icon: s.weather[0]?.icon ?? '01d',
    risk: slotRisk(s),
  }));

  const byDay = new Map<string, OwmSlot[]>();
  for (const s of upcoming) {
    const k = dayKey(s.dt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const days = [...byDay.entries()].slice(0, 5).map(([date, slots]) => {
    const mid =
      slots.find(
        (s) =>
          dayKey(s.dt, tz) === date &&
          new Date((s.dt + tz) * 1000).getUTCHours() >= 12,
      ) ?? slots[0];
    return {
      date,
      min: Math.round(Math.min(...slots.map((s) => s.main.temp))),
      max: Math.round(Math.max(...slots.map((s) => s.main.temp))),
      popPct: Math.round(Math.max(...slots.map((s) => s.pop ?? 0)) * 100),
      description: mid.weather[0]?.description ?? '',
      icon: mid.weather[0]?.icon ?? '01d',
      risk: slots.map(slotRisk).reduce(worst, 'none' as WeatherRisk),
    };
  });

  const risky = next24h.find((h) => h.risk !== 'none');
  const overall = next24h
    .map((h) => h.risk)
    .reduce(worst, 'none' as WeatherRisk);
  const alert = risky
    ? { risk: overall, message: MESSAGE[overall], from: risky.time }
    : null;

  return {
    updatedAt: new Date(now).toISOString(),
    current: current?.main
      ? {
          temp: Math.round(current.main.temp),
          feelsLike: Math.round(current.main.feels_like ?? current.main.temp),
          windKmh: kmh(current.wind?.speed),
          description: current.weather?.[0]?.description ?? '',
          icon: current.weather?.[0]?.icon ?? '01d',
        }
      : null,
    next24h,
    days,
    alert,
  };
}
