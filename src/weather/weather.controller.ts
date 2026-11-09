import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly service: WeatherService) {}

  /** Pronóstico para unas coordenadas (las del club). Cualquier usuario autenticado. */
  @Get()
  forecast(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    if (lat === undefined || lng === undefined)
      throw new BadRequestException('Faltan lat y lng');
    return this.service.forecast(Number(lat), Number(lng));
  }
}
