import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { summarizeWeather, type WeatherSummary } from './weather-summary';

const TTL_MS = 45 * 60_000;
const MAX_ENTRIES = 1000;
const API = 'https://api.openweathermap.org/data/2.5';

/**
 * Clima por coordenadas con OpenWeatherMap (plan gratis). Se guarda en memoria por zona
 * (~1 km) durante 45 minutos, así muchas consultas de usuarios cuestan una sola llamada a la API.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<
    string,
    { at: number; value: WeatherSummary }
  >();
  private readonly inflight = new Map<string, Promise<WeatherSummary>>();

  constructor(private readonly config: ConfigService) {}

  async forecast(lat: number, lng: number): Promise<WeatherSummary> {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new BadRequestException('Coordenadas inválidas');
    }
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const p = this.fetchAndSummarize(lat, lng)
      .then((value) => {
        if (this.cache.size >= MAX_ENTRIES)
          this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(key, { at: Date.now(), value });
        return value;
      })
      .catch((e) => {
        // Si la API falla pero hay una copia vieja, mejor mostrar esa que nada.
        if (hit) return hit.value;
        throw e;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async get(path: string, lat: number, lng: number, appid: string) {
    const url = `${API}/${path}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&units=metric&lang=es&appid=${appid}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      this.logger.warn(`OpenWeatherMap ${path} respondió ${res.status}`);
      throw new ServiceUnavailableException('No se pudo obtener el clima');
    }
    return res.json();
  }

  private async fetchAndSummarize(
    lat: number,
    lng: number,
  ): Promise<WeatherSummary> {
    const appid = this.config.get<string>('OPENWEATHER_API_KEY');
    if (!appid)
      throw new ServiceUnavailableException('El clima no está configurado');
    const [forecast, current] = await Promise.all([
      this.get('forecast', lat, lng, appid),
      this.get('weather', lat, lng, appid).catch(() => null),
    ]);
    return summarizeWeather(forecast, current);
  }
}
