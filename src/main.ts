import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render está detrás de un proxy: la IP real (para el rate limit) viene en X-Forwarded-For.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const allowCredentials = corsOrigin !== '*';

  app.enableCors({
    origin: corsOrigin,
    credentials: allowCredentials,
  });

  const port = Number(config.get<string>('PORT', '3001'));
  await app.listen(port, '0.0.0.0');
}
bootstrap();
