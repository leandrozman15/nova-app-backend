import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
