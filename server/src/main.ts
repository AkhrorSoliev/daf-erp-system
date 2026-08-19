import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Which portal the browser is on is derived from the host prefix
  // (`student.` / `lehrer.` / …), so testing a non-admin portal locally means
  // browsing `student.localhost:3000` rather than `localhost:3000`. Browsers
  // resolve `*.localhost` to the loopback address on their own, but the origin
  // still has to be allowed here. Development only — production keeps the
  // explicit list below and nothing else.
  const devOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://student.localhost:3000',
          'http://lehrer.localhost:3000',
          'http://invoice.localhost:3000',
          'http://form.localhost:3000',
        ];

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://client-brown-ten-36.vercel.app',
      'https://admin.dafzentrum.uz',
      'https://lehrer.dafzentrum.uz',
      'https://student.dafzentrum.uz',
      'https://invoice.dafzentrum.uz',
      'https://form.dafzentrum.uz',
      ...devOrigins,
    ],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
