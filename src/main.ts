import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render está detrás de un proxy: la IP real (para el rate limit) viene en X-Forwarded-For.
  app.set('trust proxy', 1);
  // Implantación de planillas de jugadores y fotos de productos: hasta 4 MB por pedido.
  app.useBodyParser('json', { limit: '4mb' });
  // Respuestas JSON comprimidas (gzip): listas de clubes, agenda y productos pesan ~5 veces menos.
  app.use(compression({ threshold: 1024 }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*').trim();
  const allowCredentials = corsOrigin !== '*';
  // Admite varios orígenes separados por coma; se normaliza la barra final.
  const origins = corsOrigin
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigin === '*' ? '*' : origins,
    credentials: allowCredentials,
  });

  const port = Number(config.get<string>('PORT', '3001'));
  await app.listen(port, '0.0.0.0');
}
bootstrap();
